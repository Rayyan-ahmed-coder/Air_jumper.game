import { GAME_CONFIG } from './gameConfig.ts';
import { createPipePickups } from './pickups.ts';
import type { Pipe } from './types.ts';

export function createPipe(x: number, index: number): Pipe {
  const { gapHeight, spawnTopMin, spawnTopRange, motionStartsAfter, motionEvery, motionAmplitude } =
    GAME_CONFIG.pipes;
  const top = spawnTopMin + Math.random() * spawnTopRange;
  const moves = index > motionStartsAfter && index % motionEvery === 0;

  return {
    x,
    top,
    baseTop: top,
    previousTop: top,
    motionAmplitude: moves ? motionAmplitude : 0,
    motionPhase: Math.random() * Math.PI * 2,
    scored: false,
    pickups: createPipePickups(x, top, gapHeight, index),
  };
}

export function collidesWithPipe(birdY: number, pipe: Pipe): boolean {
  const { birdX } = GAME_CONFIG.world;
  const { birdLeftRadius, birdRightRadius, birdVerticalRadius } = GAME_CONFIG.physics;
  const { width, gapHeight, horizontalCollisionPadding } = GAME_CONFIG.pipes;
  const birdLeft = birdX - birdLeftRadius;
  const birdRight = birdX + birdRightRadius;
  const birdTop = birdY - birdVerticalRadius;
  const birdBottom = birdY + birdVerticalRadius;
  const overlapsX = birdRight > pipe.x - horizontalCollisionPadding
    && birdLeft < pipe.x + width + horizontalCollisionPadding;
  const outsideGap = birdTop < pipe.top || birdBottom > pipe.top + gapHeight;
  return overlapsX && outsideGap;
}
