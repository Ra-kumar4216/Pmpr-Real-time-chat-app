import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useChatData } from '../chat/ChatDataContext'
import { useToast } from '../components/Toast'
import { useLiveHub } from '../live/LiveHub'
import { showNotification } from '../lib/notify'
import type { Person } from '../lib/types'
import { cleanCandidate, cleanSdp, callsSupported, CONNECT_TIMEOUT_MS, DISCONNECT_GRACE_MS, iceServers, mediaErrorMessage, RING_TIMEOUT_MS } from './rtc'
import { startRingtone, stopRingtone } from './ringtone'

export type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active'

export interface CallState {
  phase: CallPhase
  callId: string | null
  partner: Person | null
  video: boolean
  startedAt: number | null
  muted: boolean
  cameraOff: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
}

const IDLE: CallState = { phase: 'idle', callId: null, partner: null, video: false, startedAt: null, muted: false, cameraOff: false, localStream: null, remoteStream: null }

type EndReason = 'hangup' | 'cancel' | 'declined' | 'busy' | 'timeout'

interface CallApi {
  call: CallState
  /** Why a call cannot be started with this person right now, or null when it can. */
  blockedReason: (partnerId: string) => string | null
  start: (partner: Person, video: boolean) => Promise<void>
  accept: () => Promise<void>
  decline: () => void
  hangup: () => void
  toggleMute: () => void
  toggleCamera: () => void
}

const CallContext = createContext<CallApi | null>(null)

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 100

/**
 * One-to-one voice/video calls. The browsers connect to each other directly with WebRTC; the offer, answer and
 * network candidates are exchanged over the private channel shared with each contact (see LiveHub).
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const hub = useLiveHub()
  const chat = useChatData()
  const toast = useToast()

  const [call, setCallState] = useState<CallState>(IDLE)
  const callRef = useRef<CallState>(IDLE)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const offerRef = useRef<string | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const ringTimer = useRef<number>(undefined)
  const dropTimer = useRef<number>(undefined)
  const connectTimer = useRef<number>(undefined)

  const hubRef = useRef(hub)
  hubRef.current = hub
  const chatRef = useRef(chat)
  chatRef.current = chat

  const setCall = useCallback((next: CallState | ((c: CallState) => CallState)) => {
    const value = typeof next === 'function' ? next(callRef.current) : next
    callRef.current = value
    setCallState(value)
  }, [])

  /** Tears everything down. `tell` notifies the other person; `notice` shows a message to this user. */
  const finish = useCallback(
    (notice: string | null, tell?: EndReason) => {
      const c = callRef.current
      if (tell && c.partner && c.callId) hubRef.current.send(c.partner.id, 'call-end', { callId: c.callId, reason: tell })
      window.clearTimeout(ringTimer.current)
      window.clearTimeout(dropTimer.current)
      window.clearTimeout(connectTimer.current)
      stopRingtone()
      if (pcRef.current) {
        pcRef.current.onicecandidate = null
        pcRef.current.ontrack = null
        pcRef.current.onconnectionstatechange = null
        pcRef.current.close()
        pcRef.current = null
      }
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
      offerRef.current = null
      pendingIce.current = []
      setCall(IDLE)
      if (notice) toast.show({ title: notice })
    },
    [setCall, toast],
  )

  const flushIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingIce.current
    pendingIce.current = []
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        /* a stale candidate is harmless */
      }
    }
  }, [])

  const createPeer = useCallback(
    (partner: Person, callId: string, stream: MediaStream) => {
      const pc = new RTCPeerConnection({ iceServers: iceServers() })
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      pc.onicecandidate = (e) => {
        if (e.candidate) hubRef.current.send(partner.id, 'call-ice', { callId, candidate: e.candidate.toJSON() })
      }
      pc.ontrack = (e) => {
        const remote = e.streams[0] ?? new MediaStream([e.track])
        setCall((c) => (c.callId === callId ? { ...c, remoteStream: remote } : c))
      }
      pc.onconnectionstatechange = () => {
        if (callRef.current.callId !== callId) return
        window.clearTimeout(dropTimer.current)
        if (pc.connectionState === 'connected') {
          window.clearTimeout(connectTimer.current)
          setCall((c) => ({ ...c, phase: 'active', startedAt: c.startedAt ?? Date.now() }))
        } else if (pc.connectionState === 'failed') {
          finish('The call could not connect. Your network may block direct calls.', 'hangup')
        } else if (pc.connectionState === 'disconnected') {
          dropTimer.current = window.setTimeout(() => finish('The call was dropped.', 'hangup'), DISCONNECT_GRACE_MS)
        }
      }
      pcRef.current = pc
      return pc
    },
    [finish, setCall],
  )

  /** The answer is in but no media path yet: give up with a clear reason instead of hanging on "Connecting…". */
  const armConnectTimer = useCallback(
    (callId: string) => {
      window.clearTimeout(connectTimer.current)
      connectTimer.current = window.setTimeout(() => {
        if (callRef.current.callId === callId && callRef.current.phase === 'connecting') {
          finish('The call could not connect. Your networks may block direct calls (a relay server is needed).', 'hangup')
        }
      }, CONNECT_TIMEOUT_MS)
    },
    [finish],
  )

  const blockedReason = useCallback(
    (partnerId: string): string | null => {
      if (!callsSupported()) return 'Calls need a modern browser on HTTPS.'
      if (callRef.current.phase !== 'idle') return 'You are already on a call.'
      if (!hub.ready(partnerId)) return 'Connecting… try again in a moment.'
      return null
    },
    [hub],
  )

  const start = useCallback(
    async (partner: Person, video: boolean) => {
      const reason = blockedReason(partner.id)
      if (reason) {
        toast.show({ tone: 'error', title: 'Cannot start the call', message: reason })
        return
      }
      const callId = crypto.randomUUID()
      setCall({ ...IDLE, phase: 'calling', callId, partner, video })
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      } catch (e) {
        if (callRef.current.callId === callId) finish(null)
        toast.show({ tone: 'error', title: 'Cannot start the call', message: mediaErrorMessage(e, video) })
        return
      }
      if (callRef.current.callId !== callId) {
        stream.getTracks().forEach((t) => t.stop()) // cancelled while the permission prompt was open
        return
      }
      localRef.current = stream
      setCall((c) => ({ ...c, localStream: stream }))
      try {
        const pc = createPeer(partner, callId, stream)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (callRef.current.callId !== callId) return
        if (!hubRef.current.send(partner.id, 'call-offer', { callId, video, sdp: offer.sdp })) {
          finish(`Could not reach ${partner.display_name}. Check your connection.`)
          return
        }
        ringTimer.current = window.setTimeout(() => finish(`${partner.display_name} did not answer.`, 'timeout'), RING_TIMEOUT_MS)
      } catch {
        finish('Could not start the call.', 'cancel')
      }
    },
    [blockedReason, createPeer, finish, setCall, toast],
  )

  const accept = useCallback(async () => {
    const c = callRef.current
    if (c.phase !== 'incoming' || !c.partner || !c.callId || !offerRef.current) return
    const { callId, partner, video } = c
    window.clearTimeout(ringTimer.current)
    stopRingtone()
    setCall((x) => ({ ...x, phase: 'connecting' }))
    armConnectTimer(callId)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
    } catch (e) {
      // No usable camera on a video call: answer with voice only instead of dropping the call.
      let voiceOnly: MediaStream | null = null
      if (video) {
        try {
          voiceOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } catch {
          voiceOnly = null
        }
      }
      if (!voiceOnly) {
        toast.show({ tone: 'error', title: 'Cannot answer the call', message: mediaErrorMessage(e, video) })
        if (callRef.current.callId === callId) finish(null, 'declined')
        return
      }
      stream = voiceOnly
      toast.show({ title: 'Camera not available', message: 'You joined with your microphone only.' })
    }
    if (callRef.current.callId !== callId || !offerRef.current) {
      stream.getTracks().forEach((t) => t.stop()) // the caller hung up meanwhile
      return
    }
    localRef.current = stream
    setCall((x) => ({ ...x, localStream: stream }))
    try {
      const pc = createPeer(partner, callId, stream)
      await pc.setRemoteDescription({ type: 'offer', sdp: offerRef.current })
      await flushIce()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (callRef.current.callId !== callId) return
      hubRef.current.send(partner.id, 'call-answer', { callId, sdp: answer.sdp })
    } catch {
      finish('Could not connect the call.', 'hangup')
    }
  }, [armConnectTimer, createPeer, finish, flushIce, setCall, toast])

  const decline = useCallback(() => finish(null, 'declined'), [finish])

  const hangup = useCallback(() => {
    finish(null, callRef.current.phase === 'calling' ? 'cancel' : 'hangup')
  }, [finish])

  const toggleMute = useCallback(() => {
    setCall((c) => {
      const muted = !c.muted
      localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted))
      return { ...c, muted }
    })
  }, [setCall])

  const toggleCamera = useCallback(() => {
    setCall((c) => {
      const cameraOff = !c.cameraOff
      localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff))
      return { ...c, cameraOff }
    })
  }, [setCall])

  // Messages from the other side. A channel only ever carries its one contact, so `from` is trustworthy.
  useEffect(
    () =>
      hub.subscribe((from, event, raw) => {
        if (!event.startsWith('call-')) return
        const p = (raw ?? {}) as Record<string, unknown>
        if (!isString(p.callId)) return
        const callId = p.callId
        const c = callRef.current

        if (event === 'call-offer') {
          const sdp = cleanSdp(p.sdp)
          const person = chatRef.current.getPerson(from)
          if (!sdp || !person) return
          if (c.callId === callId) return // duplicate
          if (c.phase !== 'idle') {
            hubRef.current.send(from, 'call-end', { callId, reason: 'busy' })
            return
          }
          offerRef.current = sdp
          pendingIce.current = []
          setCall({ ...IDLE, phase: 'incoming', callId, partner: person, video: p.video === true })
          startRingtone()
          void showNotification(person.display_name, `Incoming ${p.video === true ? 'video' : 'voice'} call`, 'incoming-call')
          ringTimer.current = window.setTimeout(() => finish(`Missed call from ${person.display_name}.`, 'timeout'), RING_TIMEOUT_MS)
          return
        }

        if (c.callId !== callId || c.partner?.id !== from) return // not about the call we are in

        if (event === 'call-answer') {
          const sdp = cleanSdp(p.sdp)
          if (c.phase !== 'calling' || !sdp || !pcRef.current) return
          window.clearTimeout(ringTimer.current)
          setCall((x) => ({ ...x, phase: 'connecting' }))
          armConnectTimer(callId)
          pcRef.current
            .setRemoteDescription({ type: 'answer', sdp })
            .then(flushIce)
            .catch(() => finish('Could not connect the call.', 'hangup'))
        } else if (event === 'call-ice') {
          const cand = cleanCandidate(p.candidate)
          if (!cand) return
          if (pcRef.current?.remoteDescription) void pcRef.current.addIceCandidate(cand).catch(() => undefined)
          else pendingIce.current.push(cand)
        } else if (event === 'call-end') {
          const name = c.partner.display_name
          if (c.phase === 'incoming') finish(`Missed call from ${name}.`)
          else if (c.phase === 'calling') {
            finish(p.reason === 'declined' ? `${name} declined the call.` : p.reason === 'busy' ? `${name} is on another call.` : `${name} did not answer.`)
          } else finish('Call ended.')
        }
      }),
    [hub, finish, flushIce, setCall, armConnectTimer],
  )

  // Closing the tab mid-call should not leave the other person ringing.
  useEffect(() => {
    const onHide = () => {
      if (callRef.current.phase !== 'idle') finish(null, callRef.current.phase === 'calling' ? 'cancel' : 'hangup')
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      if (callRef.current.phase !== 'idle') finish(null, 'hangup')
    }
  }, [finish])

  const value = useMemo<CallApi>(
    () => ({ call, blockedReason, start, accept, decline, hangup, toggleMute, toggleCamera }),
    [call, blockedReason, start, accept, decline, hangup, toggleMute, toggleCamera],
  )
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export function useCall(): CallApi {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>')
  return ctx
}
