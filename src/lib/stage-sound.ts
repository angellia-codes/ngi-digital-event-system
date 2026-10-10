export type SoundKind = 'landed' | 'revealed' | 'void';

/**
 * Three short Web Audio cues. Browsers only allow audio after a tap or key press, so nothing plays until `enable()` has
 * run (the "Aktifkan suara" button or the S key). The projector-safe option never calls `play`.
 */
export function createSound() {
  let ctx: AudioContext | null = null;

  function tone(freq: number, at: number, len: number, type: OscillatorType, volume: number) {
    if (!ctx) return;
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + len + 0.05);
  }

  return {
    isOn: () => ctx !== null,
    async enable(): Promise<boolean> {
      try {
        ctx ??= new AudioContext();
        await ctx.resume();
        tone(880, 0, 0.12, 'square', 0.05);
        return true;
      } catch {
        ctx = null;
        return false;
      }
    },
    play(kind: SoundKind) {
      if (!ctx) return;
      if (kind === 'landed') {
        tone(196, 0, 0.2, 'sawtooth', 0.07);
        tone(392, 0.2, 0.35, 'sawtooth', 0.07);
      } else if (kind === 'revealed') {
        tone(523, 0, 0.12, 'square', 0.06);
        tone(659, 0.12, 0.12, 'square', 0.06);
        tone(784, 0.24, 0.3, 'square', 0.06);
      } else {
        tone(220, 0, 0.25, 'triangle', 0.08);
        tone(165, 0.25, 0.35, 'triangle', 0.08);
      }
    },
  };
}
