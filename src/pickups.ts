import type { Pickup } from './types.ts';
import { GAME_CONFIG } from './gameConfig.ts';

export function createPipePickups(x: number, top: number, gapHeight: number, pipeIndex: number): Pickup[] {
  const {
    coinOffsets,
    coinVerticalSpacing,
    gemEvery,
    starEvery,
    powerUpOffset,
    powerUpStartPipe,
    powerUpEvery,
    utilityPowerUpEvery,
    powerUpVerticalOffset,
  } = GAME_CONFIG.pickups;
  const center = top + gapHeight / 2;
  const pickups: Pickup[] = [
    { type: 'coin', x: x + coinOffsets[0], y: center - coinVerticalSpacing, collected: false },
    {
      type: pipeIndex % starEvery === 0
        ? 'star'
        : pipeIndex % gemEvery === 0
          ? 'gem'
          : 'coin',
      x: x + coinOffsets[1],
      y: center,
      collected: false,
    },
    { type: 'coin', x: x + coinOffsets[2], y: center + coinVerticalSpacing, collected: false }
  ];

  let powerUp: Pickup['type'] | undefined;
  if (pipeIndex >= powerUpStartPipe && pipeIndex % powerUpEvery === 0) {
    powerUp = Math.floor(pipeIndex / powerUpEvery) % 2 === 1 ? 'double' : 'slow';
  } else if (pipeIndex >= powerUpStartPipe && pipeIndex % utilityPowerUpEvery === 0) {
    powerUp = pipeIndex % 2 === 0 ? 'shield' : 'magnet';
  }

  if (powerUp) {
    pickups.push({
      type: powerUp,
      x: x + powerUpOffset,
      y: center + (pipeIndex % 2 === 0 ? -powerUpVerticalOffset : powerUpVerticalOffset),
      collected: false
    });
  }

  return pickups;
}

export function isPickupCollected(
  birdX: number,
  birdY: number,
  pickup: Pickup,
  magnetActive: boolean,
): boolean {
  const dx = birdX - pickup.x;
  const dy = birdY - pickup.y;
  const { coinCollisionRadius, magnetCollectionRadius, powerUpCollisionRadius } = GAME_CONFIG.pickups;
  const radius = pickup.type === 'coin' || pickup.type === 'gem' || pickup.type === 'star'
    ? (magnetActive ? magnetCollectionRadius : coinCollisionRadius)
    : powerUpCollisionRadius;
  return dx * dx + dy * dy <= radius * radius;
}

export function getPickupDespawnRadius(pickup: Pickup): number {
  const { coinDespawnRadius, powerUpDespawnRadius } = GAME_CONFIG.pickups;
  return pickup.type === 'coin' || pickup.type === 'gem' || pickup.type === 'star'
    ? coinDespawnRadius
    : powerUpDespawnRadius;
}

export function canDespawnPipe(pipe: { x: number; pickups: Pickup[] }, pipeWidth: number): boolean {
  return pipe.x + pipeWidth < 0
    && pipe.pickups.every((pickup) => (
      pickup.collected || pickup.x + getPickupDespawnRadius(pickup) < 0
    ));
}
