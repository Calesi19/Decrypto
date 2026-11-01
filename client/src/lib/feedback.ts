const SOUND_KEY = 'decrypto-sound';

type Cue = 'tick' | 'confirm' | 'phase' | 'stamp';

const CUES: Record<Cue, { tones: [number, number][]; type: OscillatorType; vibrate: number[] }> = {
  tick: { tones: [[1400, 0.02]], type: 'square', vibrate: [6] },
  confirm: { tones: [[660, 0.06], [990, 0.09]], type: 'square', vibrate: [14, 30, 14] },
  phase: { tones: [[520, 0.05], [520, 0.05]], type: 'sine', vibrate: [10] },
  stamp: { tones: [[140, 0.12]], type: 'sawtooth', vibrate: [40] },
};

let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  return window.localStorage.getItem(SOUND_KEY) !== 'off';
}

export function setSoundEnabled(enabled: boolean): void {
  window.localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
}

// Browsers only allow audio after a gesture, so the context is opened on the first tap.
export function unlockAudio(): void {
  if (!context && 'AudioContext' in window) context = new AudioContext();
  void context?.resume();
}

export function cue(name: Cue): void {
  const { tones, type, vibrate } = CUES[name];
  // Chrome blocks vibration until the first tap and logs an error if asked sooner.
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(vibrate);
  if (!context || context.state !== 'running' || !soundEnabled()) return;

  let at = context.currentTime;
  for (const [frequency, duration] of tones) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
    at += duration + 0.03;
  }
}
