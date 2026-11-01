const SOUND_KEY = 'decrypto-sound';

type Cue = 'tick' | 'relay' | 'teletype' | 'confirm' | 'phase' | 'stamp' | 'static';

const CUES: Record<
  Cue,
  { tones: [number, number][]; type: OscillatorType; vibrate: number[]; noise?: number }
> = {
  tick: { tones: [[1400, 0.02]], type: 'square', vibrate: [6] },
  relay: { tones: [[320, 0.015], [190, 0.03]], type: 'square', vibrate: [12] },
  teletype: {
    tones: [1180, 940, 1320, 1060, 880, 1240, 990, 1120].map((pitch) => [pitch, 0.018]),
    type: 'square',
    vibrate: [8, 24, 8, 24, 8],
  },
  confirm: { tones: [[660, 0.06], [990, 0.09]], type: 'square', vibrate: [14, 30, 14] },
  phase: { tones: [[520, 0.05], [520, 0.05]], type: 'sine', vibrate: [10] },
  stamp: { tones: [[140, 0.12]], type: 'sawtooth', vibrate: [40] },
  static: { tones: [], type: 'sine', vibrate: [20, 30, 20], noise: 0.4 },
};

let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  return window.localStorage.getItem(SOUND_KEY) === 'on';
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
  const { tones, type, vibrate, noise } = CUES[name];
  // Chrome blocks vibration until the first tap and logs an error if asked sooner.
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(vibrate);
  if (!context || context.state !== 'running' || !soundEnabled()) return;

  let at = context.currentTime;
  if (noise) {
    const samples = Math.floor(context.sampleRate * noise);
    const buffer = context.createBuffer(1, samples, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < samples; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.03, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + noise);
    source.connect(gain).connect(context.destination);
    source.start(at);
  }
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
