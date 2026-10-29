/** How long an unanswered call rings, on both sides. */
export const RING_TIMEOUT_MS = 45_000
/** After the other side answers, the audio/video path must come up within this time. */
export const CONNECT_TIMEOUT_MS = 30_000
/** A dropped connection gets this long to recover before the call is ended. */
export const DISCONNECT_GRACE_MS = 10_000

const MAX_SDP = 100_000

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  const urls = import.meta.env.VITE_TURN_URLS
  if (urls && relayConfigured()) {
    servers.push({
      urls: urls.split(',').map((u) => u.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}

/** True when a TURN relay was configured at build time (VITE_TURN_*). */
export function relayConfigured(): boolean {
  return Boolean(import.meta.env.VITE_TURN_URLS && import.meta.env.VITE_TURN_USERNAME && import.meta.env.VITE_TURN_CREDENTIAL)
}

export function callsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Plain-language reason a microphone/camera request failed. */
export function mediaErrorMessage(e: unknown, video: boolean): string {
  const name = e instanceof DOMException ? e.name : ''
  const what = video ? 'camera and microphone' : 'microphone'
  if (name === 'NotAllowedError' || name === 'SecurityError') return `Allow ${what} access in your browser to make calls.`
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${what} found on this device.`
  if (name === 'NotReadableError') return `Your ${what} is being used by another app.`
  return `Could not start the ${what}.`
}

/** Signalling data comes from the other person's browser, so check its shape before using it. */
export function cleanSdp(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SDP ? value : null
}

export function cleanCandidate(value: unknown): RTCIceCandidateInit | null {
  if (!value || typeof value !== 'object') return null
  const c = value as Record<string, unknown>
  if (typeof c.candidate !== 'string' || c.candidate.length > 2000) return null
  return {
    candidate: c.candidate,
    sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
    sdpMLineIndex: typeof c.sdpMLineIndex === 'number' ? c.sdpMLineIndex : null,
  }
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
