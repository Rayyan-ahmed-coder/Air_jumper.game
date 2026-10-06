import type { BirdId, BirdPalette, BirdSelectionResult } from './types.ts';
import { GAME_CONFIG } from './gameConfig.ts';

export const BIRDS: Readonly<Record<BirdId, BirdPalette>> = {
  sunny: { id: 'sunny', name: 'Sunny', cost: 0, body: '#f7b84c', belly: '#ffe08a', wing: '#ed9c3e', tail: '#ef9d43' },
  sky: { id: 'sky', name: 'Bluebell', cost: 80, body: '#6db8e6', belly: '#c7eaff', wing: '#4599d0', tail: '#559fdb' },
  berry: { id: 'berry', name: 'Berry', cost: 160, body: '#ed83a6', belly: '#ffd4e1', wing: '#d85e89', tail: '#e56f96' },
  mint: { id: 'mint', name: 'Minty', cost: 240, body: '#70cbb0', belly: '#d0fff0', wing: '#48ad91', tail: '#57b99c' },
  midnight: { id: 'midnight', name: 'Stardust', cost: 320, body: '#8177d8', belly: '#dedbff', wing: '#6058b5', tail: '#7067c4' }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBirdId(value: unknown): value is BirdId {
  return typeof value === 'string' && Object.hasOwn(BIRDS, value);
}

export function createProgression() {
  let coins = 0;
  let selectedBird: BirdId = 'sunny';
  const unlockedBirds = new Set<BirdId>(['sunny']);

  try {
    const saved: unknown = JSON.parse(localStorage.getItem(GAME_CONFIG.storage.profile) ?? '{}');
    if (!isRecord(saved)) throw new TypeError('Saved flight progress must be an object.');
    coins = Number.isSafeInteger(saved.coins) && typeof saved.coins === 'number' && saved.coins >= 0
      ? saved.coins
      : 0;
    if (Array.isArray(saved.unlockedBirds)) {
      for (const id of saved.unlockedBirds) {
        if (isBirdId(id)) unlockedBirds.add(id);
      }
    }
    if (isBirdId(saved.selectedBird) && unlockedBirds.has(saved.selectedBird)) {
      selectedBird = saved.selectedBird;
    }
  } catch (error) {
    console.warn('Could not load saved flight progress.', error);
  }

  function save() {
    try {
      localStorage.setItem(GAME_CONFIG.storage.profile, JSON.stringify({
        coins,
        selectedBird,
        unlockedBirds: [...unlockedBirds]
      }));
    } catch (error) {
      console.warn('Could not save flight progress.', error);
    }
  }

  function addCoins(amount: number): number {
    if (!Number.isSafeInteger(amount) || amount <= 0) return coins;
    coins = Math.min(Number.MAX_SAFE_INTEGER, coins + amount);
    save();
    return coins;
  }

  function chooseBird(id: string): BirdSelectionResult {
    if (!isBirdId(id)) return { status: 'invalid', bird: selectedBird };
    const bird = BIRDS[id];
    if (unlockedBirds.has(id)) {
      selectedBird = id;
      save();
      return { status: 'selected', bird: selectedBird };
    }
    if (coins < bird.cost) return { status: 'insufficient', bird: selectedBird };
    coins -= bird.cost;
    unlockedBirds.add(id);
    selectedBird = id;
    save();
    return { status: 'unlocked', bird: selectedBird };
  }

  return {
    addCoins,
    chooseBird,
    get coins() { return coins; },
    get selectedBird() { return BIRDS[selectedBird]; },
    isUnlocked(id: string): boolean { return isBirdId(id) && unlockedBirds.has(id); }
  };
}