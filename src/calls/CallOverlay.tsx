import { useEffect, useRef, useState, type RefObject } from "react";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { useCall } from "./CallProvider";
import { formatDuration } from "./rtc";

function useStream(
  ref: RefObject<HTMLMediaElement | null>,
  stream: MediaStream | null,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void Promise.resolve(el.play?.()).catch(() => undefined); // autoplay can be refused; the user already clicked to start the call
  }, [ref, stream]);
}

function IncomingCall() {
  const { call, accept, decline } = useCall();
  const acceptBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => acceptBtn.current?.focus(), []);
  const name = call.partner?.display_name ?? "";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
      className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-card motion-safe:animate-rise">
        <div className="flex justify-center">
          <span className="relative inline-grid">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-fuchsia-400/40 motion-safe:animate-ping"
            />
            <Avatar name={name} path={call.partner?.avatar_path} size="2xl" />
          </span>
        </div>
        <h2
          id="incoming-call-title"
          className="mt-5 text-xl font-semibold text-slate-900"
        >
          {name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Incoming {call.video ? "video" : "voice"} call…
        </p>
        <div className="mt-8 flex items-center justify-center gap-10">
          <button
            type="button"
            onClick={decline}
            aria-label="Decline call"
            className="grid size-16 place-items-center rounded-full bg-rose-600 text-white shadow-cta transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
          >
            <PhoneOff aria-hidden className="size-7" />
          </button>
          <button
            ref={acceptBtn}
            type="button"
            onClick={() => void accept()}
            aria-label="Accept call"
            className="grid size-16 place-items-center rounded-full bg-emerald-500 text-white shadow-cta transition hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            {call.video ? (
              <Video aria-hidden className="size-7" />
            ) : (
              <Phone aria-hidden className="size-7" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function OngoingCall() {
  const { call, hangup, toggleMute, toggleCamera } = useCall();
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useStream(remoteVideo, call.video ? call.remoteStream : null);
  useStream(remoteAudio, call.video ? null : call.remoteStream);
  useStream(localVideo, call.video ? call.localStream : null);

  useEffect(() => {
    if (call.phase !== "active") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [call.phase]);

  const hasCamera = (call.localStream?.getVideoTracks().length ?? 0) > 0;
  const name = call.partner?.display_name ?? "";
  const status =
    call.phase === "calling"
      ? "Calling…"
      : call.phase === "connecting"
        ? "Connecting…"
        : formatDuration(now - (call.startedAt ?? now));
  const showRemoteVideo =
    call.video && call.remoteStream !== null && call.phase === "active";
  const ctl =
    "grid size-14 place-items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${name}`}
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950 text-white"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {call.video && (
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            aria-label="Remote video"
            data-testid="remote-video"
            className={`size-full object-cover ${showRemoteVideo ? "" : "invisible"}`}
          />
        )}
        {!call.video && (
          <audio ref={remoteAudio} autoPlay data-testid="remote-audio" />
        )}

        {!showRemoteVideo && (
          <div className="absolute inset-0 grid place-items-center bg-linear-to-b from-violet-900 via-fuchsia-900 to-slate-950">
            <div className="flex flex-col items-center gap-4 text-center">
              <Avatar name={name} path={call.partner?.avatar_path} size="2xl" />
              <p className="text-2xl font-semibold">{name}</p>
              <p
                role="status"
                className="text-sm text-white/80"
                data-testid="call-status"
              >
                {status}
              </p>
            </div>
          </div>
        )}

        {showRemoteVideo && (
          <div className="pointer-events-none absolute top-0 left-0 bg-linear-to-b from-black/60 to-transparent px-5 pt-5 pb-10">
            <p className="font-semibold">{name}</p>
            <p
              role="status"
              className="text-sm text-white/80"
              data-testid="call-status"
            >
              {status}
            </p>
          </div>
        )}

        {call.video && hasCamera && (
          <video
            ref={localVideo}
            muted
            autoPlay
            playsInline
            aria-label="Your camera"
            data-testid="local-video"
            style={{ transform: "scaleX(-1)" }}
            className={`absolute top-4 right-4 w-28 rounded-2xl border border-white/30 bg-slate-800 object-cover shadow-card sm:w-44 ${call.cameraOff ? "opacity-30" : ""}`}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-5 bg-slate-950 px-6 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={call.muted}
          aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
          className={`${ctl} ${call.muted ? "bg-white text-slate-900" : "bg-white/15 hover:bg-white/25"}`}
        >
          {call.muted ? (
            <MicOff aria-hidden className="size-6" />
          ) : (
            <Mic aria-hidden className="size-6" />
          )}
        </button>
        {call.video && hasCamera && (
          <button
            type="button"
            onClick={toggleCamera}
            aria-pressed={call.cameraOff}
            aria-label={call.cameraOff ? "Turn camera on" : "Turn camera off"}
            className={`${ctl} ${call.cameraOff ? "bg-white text-slate-900" : "bg-white/15 hover:bg-white/25"}`}
          >
            {call.cameraOff ? (
              <VideoOff aria-hidden className="size-6" />
            ) : (
              <Video aria-hidden className="size-6" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={hangup}
          aria-label="End call"
          className={`${ctl} bg-rose-600 hover:bg-rose-700`}
        >
          <PhoneOff aria-hidden className="size-6" />
        </button>
      </div>
    </div>
  );
}

/** Full-screen call UI. Renders nothing while there is no call. */
export function CallOverlay() {
  const { call } = useCall();
  if (call.phase === "idle" || !call.partner) return null;
  return call.phase === "incoming" ? <IncomingCall /> : <OngoingCall />;
}
