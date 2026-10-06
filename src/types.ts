export type GameState = 'ready' | 'countdown' | 'playing' | 'paused' | 'over';

export type WorldId = 'meadow' | 'sugar-cloud' | 'twilight-ridge' | 'aurora-sky';

export type PickupType = 'coin' | 'gem' | 'star' | 'shield' | 'magnet' | 'double' | 'slow';

export interface Pickup {
  type: PickupType;
  x: number;
  y: number;
  collected: boolean;
}

export interface Pipe {
  x: number;
  top: number;
  baseTop: number;
  previousTop: number;
  motionAmplitude: number;
  motionPhase: number;
  scored: boolean;
  pickups: Pickup[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface BirdPalette {
  id: BirdId;
  name: string;
  cost: number;
  body: string;
  belly: string;
  wing: string;
  tail: string;
}

export interface RenderFrame {
  state: GameState;
  birdY: number;
  velocity: number;
  worldTime: number;
  groundOffset: number;
  invulnerable: number;
  pipes: Pipe[];
  toastText: string;
  toastTimer: number;
  bird: BirdPalette;
  world: WorldId;
}

export type BirdId = 'sunny' | 'sky' | 'berry' | 'mint' | 'midnight';

export type BirdSelectionResult =
  | { status: 'invalid' | 'insufficient' | 'selected' | 'unlocked'; bird: BirdId };

export interface SoundControllerOptions {
  isPlaying: () => boolean;
  onUnavailable: () => void;
}
