import type { SoundControllerOptions } from './types.ts';
import { GAME_CONFIG } from './gameConfig.ts';

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export function createSoundController({ isPlaying, onUnavailable }: SoundControllerOptions) {
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    let musicTimer: number | null = null;
    let musicStep = 0;
    let enabled = true;

    function ensure(): boolean {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
              enabled = false;
              onUnavailable();
              console.warn('Web Audio is not available in this browser.');
              return false;
            }
            context = new AudioContext();
            master = context.createGain();
            master.gain.value = enabled ? GAME_CONFIG.audio.masterVolume : 0;
            master.connect(context.destination);
        }
        if (context.state === 'suspended') context.resume();
        return true;
    }

    function tone(
        frequency: number,
        duration: number,
        shape: OscillatorType,
        volume: number,
        endFrequency?: number,
    ): void {
        if (!enabled || !ensure()) return;
        const audioContext = context;
        const masterGain = master;
        if (!audioContext || !masterGain) return;
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const envelope = audioContext.createGain();
        oscillator.type = shape;
        oscillator.frequency.setValueAtTime(frequency, now);
        if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
        envelope.gain.setValueAtTime(.0001, now);
        envelope.gain.exponentialRampToValueAtTime(volume, now + .012);
        envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(envelope);
        envelope.connect(masterGain);
        oscillator.start(now);
        oscillator.stop(now + duration + .025);
    }

    function stopMusic(): void {
        if (musicTimer) window.clearInterval(musicTimer);
        musicTimer = null;
    }

    function startMusic(): void {
        if (!enabled || musicTimer) return;
        const { melody, musicIntervalMs } = GAME_CONFIG.audio;
        musicStep = 0;
        musicTimer = window.setInterval(() => {
            if (!isPlaying() || !enabled) return;
            const note = melody[musicStep % melody.length];
            tone(note, .28, 'sine', .025, note * 1.012);
            if (musicStep % 4 === 0) tone(note / 2, .46, 'triangle', .017);
            musicStep += 1;
        }, musicIntervalMs);
    }

    function setEnabled(value: boolean): void {
      enabled = value;
      if (context && master) {
        const now = context.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(enabled ? GAME_CONFIG.audio.masterVolume : 0, now, .035);
      }
      if (enabled && isPlaying()) startMusic();
      if (!enabled) stopMusic();
    }

    return { ensure, tone, startMusic, stopMusic, setEnabled };
}