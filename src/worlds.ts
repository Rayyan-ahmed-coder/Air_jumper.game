import type { WorldId } from './types.ts';

export interface WorldRegion {
  id: WorldId;
  name: string;
  startScore: number;
  rewardCoins: number;
  colors: {
    skyTop: string;
    skyMiddle: string;
    skyBottom: string;
    sunGlow: string;
    sun: string;
    distantMountain: string;
    nearMountain: string;
    hill: string;
    pipeStart: string;
    pipeLight: string;
    pipeMiddle: string;
    pipeEnd: string;
    rimStart: string;
    rimLight: string;
    rimMiddle: string;
    rimEnd: string;
    groundTop: string;
    groundMiddle: string;
    groundBottom: string;
  };
}

export const WORLD_REGIONS = [
  {
    id: 'meadow',
    name: 'Mellow Meadow',
    startScore: 0,
    rewardCoins: 0,
    colors: {
      skyTop: '#9edbe2', skyMiddle: '#d4efcf', skyBottom: '#f4e6b8',
      sunGlow: 'rgba(255, 251, 211, .74)', sun: 'rgba(255, 248, 207, .78)',
      distantMountain: '#adc9cb', nearMountain: '#8fb8b1', hill: '#cce1b6',
      pipeStart: '#4d9f79', pipeLight: '#78c18a', pipeMiddle: '#65b47e', pipeEnd: '#3b8b6b',
      rimStart: '#438d6d', rimLight: '#85d393', rimMiddle: '#6dbf83', rimEnd: '#397e63',
      groundTop: '#f4d595', groundMiddle: '#dfb777', groundBottom: '#c89562',
    },
  },
  {
    id: 'sugar-cloud',
    name: 'Sugar Cloud',
    startScore: 10,
    rewardCoins: 20,
    colors: {
      skyTop: '#eabbd6', skyMiddle: '#f6dfd2', skyBottom: '#fff0c9',
      sunGlow: 'rgba(255, 239, 197, .78)', sun: 'rgba(255, 246, 213, .84)',
      distantMountain: '#d8b6cf', nearMountain: '#bb9ec3', hill: '#c8d9b1',
      pipeStart: '#ac65a6', pipeLight: '#dc91c7', pipeMiddle: '#c97db8', pipeEnd: '#8f548f',
      rimStart: '#99568f', rimLight: '#e4a0cf', rimMiddle: '#ca7db4', rimEnd: '#824a83',
      groundTop: '#f0d0a2', groundMiddle: '#dfb681', groundBottom: '#bb916a',
    },
  },
  {
    id: 'twilight-ridge',
    name: 'Twilight Ridge',
    startScore: 25,
    rewardCoins: 35,
    colors: {
      skyTop: '#526a9a', skyMiddle: '#a08eac', skyBottom: '#f0bda8',
      sunGlow: 'rgba(255, 220, 185, .62)', sun: 'rgba(255, 229, 198, .88)',
      distantMountain: '#7784ac', nearMountain: '#68799e', hill: '#a4afad',
      pipeStart: '#486b9c', pipeLight: '#79a4c8', pipeMiddle: '#648fba', pipeEnd: '#3e5f8c',
      rimStart: '#3e5f8c', rimLight: '#8ab4d0', rimMiddle: '#648fb3', rimEnd: '#354f79',
      groundTop: '#dfbf9c', groundMiddle: '#cba884', groundBottom: '#a98472',
    },
  },
  {
    id: 'aurora-sky',
    name: 'Aurora Sky',
    startScore: 50,
    rewardCoins: 60,
    colors: {
      skyTop: '#193b5a', skyMiddle: '#39767e', skyBottom: '#c2d9b1',
      sunGlow: 'rgba(159, 255, 222, .64)', sun: 'rgba(223, 255, 220, .9)',
      distantMountain: '#557d89', nearMountain: '#426b79', hill: '#88ad93',
      pipeStart: '#347e78', pipeLight: '#80c9a2', pipeMiddle: '#5caf91', pipeEnd: '#286660',
      rimStart: '#286660', rimLight: '#9bdcb4', rimMiddle: '#64b395', rimEnd: '#23574f',
      groundTop: '#d3c99a', groundMiddle: '#b8a980', groundBottom: '#8e8a70',
    },
  },
] as const satisfies readonly WorldRegion[];

export function getWorldForScore(score: number): WorldRegion {
  let current: WorldRegion = WORLD_REGIONS[0];
  for (let index = 1; index < WORLD_REGIONS.length; index += 1) {
    const region = WORLD_REGIONS[index];
    if (score < region.startScore) break;
    current = region;
  }
  return current;
}
