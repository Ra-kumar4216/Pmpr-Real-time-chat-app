/** A soft two-tone ring for incoming calls, made with the Web Audio API so no sound file is needed. */
let ctx: AudioContext | null = null;
let timer: number | undefined;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * Browsers keep sound locked until the person has touched the page once. Unlock on the first tap or key press,
 * so a call that arrives later can ring.
 */
export function primeAudio() {
  try {
    const c = audio();
    if (c.state === "suspended") void c.resume();
  } catch {
    /* no audio available */
  }
}

if (typeof window !== "undefined") {
  const unlock = () => {
    primeAudio();
    for (const e of ["pointerdown", "touchstart", "keydown"])
      window.removeEventListener(e, unlock);
  };
  for (const e of ["pointerdown", "touchstart", "keydown"])
    window.addEventListener(e, unlock, { passive: true });
}

function beep() {
  try {
    navigator.vibrate?.([400, 200, 400]);
    audio();
    if (ctx!.state === "suspended") void ctx!.resume();
    const now = ctx!.currentTime;
    for (const [i, freq] of [440, 520].entries()) {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.45 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.45 + 0.4);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.45);
      osc.stop(now + i * 0.45 + 0.42);
    }
  } catch {
    /* no audio available; the on-screen prompt is still shown */
  }
}

export function startRingtone() {
  stopRingtone();
  beep();
  timer = window.setInterval(beep, 2200);
}

export function stopRingtone() {
  window.clearInterval(timer);
  timer = undefined;
  try {
    navigator.vibrate?.(0);
  } catch {
    /* not supported */
  }
}
