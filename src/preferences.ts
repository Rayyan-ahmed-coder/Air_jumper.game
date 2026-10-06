import { GAME_CONFIG } from './gameConfig.ts';

export function loadBestScore(): number {
  try {
    return Number(
      localStorage.getItem(GAME_CONFIG.storage.bestScore)
      ?? localStorage.getItem(GAME_CONFIG.storage.legacyBestScore),
    ) || 0;
  } catch (error) {
    console.warn('Could not load saved game preferences.', error);
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(GAME_CONFIG.storage.bestScore, String(score));
  } catch (error) {
    console.warn('Could not save your best score.', error);
  }
}

export function loadSoundEnabled(): boolean {
  try {
    return (
      localStorage.getItem(GAME_CONFIG.storage.soundPreference)
      ?? localStorage.getItem(GAME_CONFIG.storage.legacySoundPreference)
    ) !== 'off';
  } catch (error) {
    console.warn('Could not load saved game preferences.', error);
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(GAME_CONFIG.storage.soundPreference, enabled ? 'on' : 'off');
  } catch (error) {
    console.warn('Could not save sound preference.', error);
  }
}
