import type { Particle, Pickup, Pipe, RenderFrame } from './types.ts';
import { GAME_CONFIG } from './gameConfig.ts';
import { WORLD_REGIONS } from './worlds.ts';

const { width: WIDTH, height: HEIGHT, groundY: GROUND_Y, birdX: BIRD_X } = GAME_CONFIG.world;
const { gapHeight: GAP_HEIGHT, width: PIPE_WIDTH } = GAME_CONFIG.pipes;
const { maxParticles: MAX_PARTICLES, maxDevicePixelRatio } = GAME_CONFIG.rendering;

const pickupColors: Record<Pickup['type'], string> = {
  coin: '#ffd45b',
  gem: '#60d5d2',
  star: '#ffbe45',
  shield: 'rgba(103, 211, 216, .9)',
  magnet: 'rgba(154, 139, 244, .92)',
  double: 'rgba(255, 178, 83, .94)',
  slow: 'rgba(113, 174, 244, .94)',
};

const pickupLabels: Record<Pickup['type'], string> = {
  coin: 'C',
  gem: 'G',
  star: '★',
  shield: 'S',
  magnet: 'M',
  double: '2×',
  slow: 'T',
};

const clouds = [
  { x: 75, y: 158, scale: 0.82, speed: 0.1 },
  { x: 365, y: 227, scale: 1.02, speed: 0.16 },
  { x: 212, y: 85, scale: 0.65, speed: 0.08 },
  { x: 444, y: 390, scale: 0.73, speed: 0.13 },
  { x: 535, y: 307, scale: 0.58, speed: 0.09 },
];

const distantMountain = [
  [-40, 473], [42, 404], [99, 433], [173, 357], [239, 437],
  [328, 379], [396, 436], [482, 374], [579, 355],
] as const;

const nearMountain = [
  [-36, 523], [54, 449], [113, 478], [206, 419], [278, 488],
  [358, 431], [432, 481], [503, 428], [572, 427],
] as const;

interface RenderStyles {
  sky: CanvasGradient;
  sunGlow: CanvasGradient;
  pipe: CanvasGradient;
  rim: CanvasGradient;
  ground: CanvasGradient;
  sun: string;
  distantMountain: string;
  nearMountain: string;
  hill: string;
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const context: CanvasRenderingContext2D = (() => {
    const canvasContext = canvas.getContext('2d', { alpha: false });
    if (!canvasContext) throw new Error('Could not create the game canvas context.');
    return canvasContext;
  })();

  const particles: Particle[] = [];
  const particlePool: Particle[] = [];
  const backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.width = WIDTH;
  backgroundCanvas.height = HEIGHT;
  const backgroundContext: CanvasRenderingContext2D = (() => {
    const canvasContext = backgroundCanvas.getContext('2d', { alpha: false });
    if (!canvasContext) throw new Error('Could not create the cached game background.');
    return canvasContext;
  })();

  const groundDetailsCanvas = document.createElement('canvas');
  groundDetailsCanvas.width = WIDTH + 36;
  groundDetailsCanvas.height = HEIGHT - GROUND_Y;
  const groundDetailsContext = groundDetailsCanvas.getContext('2d');
  if (!groundDetailsContext) throw new Error('Could not create the cached ground texture.');
  for (let x = 0; x < groundDetailsCanvas.width; x += 36) {
    groundDetailsContext.fillStyle = 'rgba(169, 119, 68, .25)';
    groundDetailsContext.beginPath();
    groundDetailsContext.ellipse(x + 9, 31, 12, 3, 0, 0, Math.PI * 2);
    groundDetailsContext.fill();
    groundDetailsContext.fillStyle = 'rgba(255, 239, 183, .24)';
    groundDetailsContext.beginPath();
    groundDetailsContext.ellipse(x + 25, 54, 8, 2.5, 0, 0, Math.PI * 2);
    groundDetailsContext.fill();
  }

  let styles: RenderStyles | undefined;
  let styledWorld: RenderFrame['world'] | undefined;

  function createStyles(worldId: RenderFrame['world']): RenderStyles {
    const { colors } = WORLD_REGIONS.find((region) => region.id === worldId) ?? WORLD_REGIONS[0];
    const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, colors.skyTop);
    sky.addColorStop(0.56, colors.skyMiddle);
    sky.addColorStop(1, colors.skyBottom);

    const sunGlow = context.createRadialGradient(410, 147, 8, 410, 147, 114);
    sunGlow.addColorStop(0, colors.sunGlow);
    sunGlow.addColorStop(1, 'rgba(255, 251, 211, 0)');

    const pipe = context.createLinearGradient(0, 0, PIPE_WIDTH, 0);
    pipe.addColorStop(0, colors.pipeStart);
    pipe.addColorStop(0.2, colors.pipeLight);
    pipe.addColorStop(0.66, colors.pipeMiddle);
    pipe.addColorStop(1, colors.pipeEnd);

    const rim = context.createLinearGradient(0, 0, PIPE_WIDTH, 0);
    rim.addColorStop(0, colors.rimStart);
    rim.addColorStop(0.22, colors.rimLight);
    rim.addColorStop(0.72, colors.rimMiddle);
    rim.addColorStop(1, colors.rimEnd);

    const ground = context.createLinearGradient(0, GROUND_Y, 0, HEIGHT);
    ground.addColorStop(0, colors.groundTop);
    ground.addColorStop(0.16, colors.groundMiddle);
    ground.addColorStop(1, colors.groundBottom);
    return {
      sky,
      sunGlow,
      pipe,
      rim,
      ground,
      sun: colors.sun,
      distantMountain: colors.distantMountain,
      nearMountain: colors.nearMountain,
      hill: colors.hill,
    };
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
  }

  function rebuildBackground(): void {
    if (!styles) return;
    backgroundContext.clearRect(0, 0, WIDTH, HEIGHT);
    backgroundContext.fillStyle = styles.sky;
    backgroundContext.fillRect(0, 0, WIDTH, HEIGHT);
    backgroundContext.fillStyle = styles.sunGlow;
    backgroundContext.fillRect(279, 18, 258, 258);
    backgroundContext.beginPath();
    backgroundContext.arc(410, 147, 36, 0, Math.PI * 2);
    backgroundContext.fillStyle = styles.sun;
    backgroundContext.fill();

    drawMountain(backgroundContext, distantMountain, styles.distantMountain, 0);
    drawMountain(backgroundContext, nearMountain, styles.nearMountain, 0);

    backgroundContext.fillStyle = styles.hill;
    backgroundContext.beginPath();
    backgroundContext.moveTo(0, 526);
    backgroundContext.quadraticCurveTo(128, 492, 265, 526);
    backgroundContext.quadraticCurveTo(408, 556, 540, 510);
    backgroundContext.lineTo(WIDTH, GROUND_Y);
    backgroundContext.lineTo(0, GROUND_Y);
    backgroundContext.closePath();
    backgroundContext.fill();
  }

  function addParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i += 1) {
      const life = 0.32 + Math.random() * 0.24;
      const particle = particlePool.pop() ?? {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 0,
        color: '',
      };
      particle.x = x;
      particle.y = y;
      particle.vx = (Math.random() - 0.5) * 180;
      particle.vy = (Math.random() - 0.5) * 180;
      particle.life = life;
      particle.maxLife = life;
      particle.size = 2 + Math.random() * 3;
      particle.color = color;
      particles.push(particle);
    }
  }

  function updateParticles(delta: number): void {
    for (let index = 0; index < particles.length;) {
      const particle = particles[index];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      const offscreen = particle.x + particle.size < 0
        || particle.x - particle.size > WIDTH
        || particle.y + particle.size < 0
        || particle.y - particle.size > HEIGHT;
      if (particle.life <= 0 || offscreen) {
        particlePool.push(particle);
        particles[index] = particles[particles.length - 1];
        particles.pop();
      } else {
        index += 1;
      }
    }
  }

  function clearParticles(): void {
    particlePool.push(...particles);
    particles.length = 0;
  }

  function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function drawCloud(x: number, y: number, scale: number): void {
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.globalAlpha = 0.72;
    context.fillStyle = '#fffdf2';
    context.beginPath();
    context.ellipse(0, 9, 39, 11, 0, 0, Math.PI * 2);
    context.ellipse(-18, 4, 17, 14, -0.12, 0, Math.PI * 2);
    context.ellipse(1, -3, 20, 20, 0, 0, Math.PI * 2);
    context.ellipse(23, 5, 17, 13, 0.14, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMountain(
    target: CanvasRenderingContext2D,
    points: readonly (readonly [number, number])[],
    fill: string,
    offset: number,
  ): void {
    target.beginPath();
    target.moveTo(points[0][0] - offset, points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      target.lineTo(points[i][0] - offset, points[i][1]);
    }
    target.lineTo(WIDTH, GROUND_Y);
    target.lineTo(0, GROUND_Y);
    target.closePath();
    target.fillStyle = fill;
    target.fill();
  }

  function drawBackground(worldTime: number): void {
    if (!styles) return;
    context.drawImage(backgroundCanvas, 0, 0);

    for (const cloud of clouds) {
      const drift = (worldTime * cloud.speed) % (WIDTH + 150);
      let x = cloud.x - drift;
      if (x < -90) x += WIDTH + 170;
      drawCloud(x, cloud.y, cloud.scale);
    }

  }

  function drawPipe(pipe: Pipe): void {
    if (!styles) return;
    const bottomTop = pipe.top + GAP_HEIGHT;
    context.save();
    context.translate(pipe.x, 0);
    context.fillStyle = styles.pipe;
    roundedRect(7, -32, PIPE_WIDTH - 14, pipe.top - 1, 10);
    context.fill();
    roundedRect(7, bottomTop + 23, PIPE_WIDTH - 14, GROUND_Y - bottomTop - 22, 10);
    context.fill();

    context.fillStyle = 'rgba(218, 255, 203, .24)';
    roundedRect(18, 0, 8, pipe.top - 7, 4);
    context.fill();
    roundedRect(18, bottomTop + 29, 8, GROUND_Y - bottomTop - 34, 4);
    context.fill();

    context.fillStyle = styles.rim;
    roundedRect(0, pipe.top - 24, PIPE_WIDTH, 25, 7);
    context.fill();
    roundedRect(0, bottomTop, PIPE_WIDTH, 25, 7);
    context.fill();
    context.fillStyle = 'rgba(230, 255, 217, .24)';
    roundedRect(10, pipe.top - 20, 5, 17, 2.5);
    context.fill();
    roundedRect(10, bottomTop + 4, 5, 17, 2.5);
    context.fill();
    context.strokeStyle = 'rgba(44, 112, 84, .22)';
    context.lineWidth = 1.5;
    roundedRect(0.75, pipe.top - 23.25, PIPE_WIDTH - 1.5, 23.5, 7);
    context.stroke();
    roundedRect(0.75, bottomTop + 0.75, PIPE_WIDTH - 1.5, 23.5, 7);
    context.stroke();
    if (pipe.motionAmplitude > 0) {
      context.fillStyle = 'rgba(220, 255, 250, .92)';
      context.font = '900 12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('↕', PIPE_WIDTH / 2, pipe.top - 11);
      context.fillText('↕', PIPE_WIDTH / 2, bottomTop + 12);
    }
    context.restore();
  }

  function drawGround(groundOffset: number): void {
    if (!styles) return;
    context.fillStyle = styles.ground;
    context.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
    context.fillStyle = '#8bc890';
    context.fillRect(0, GROUND_Y, WIDTH, 10);
    context.fillStyle = 'rgba(237, 255, 199, .55)';
    context.fillRect(0, GROUND_Y, WIDTH, 3);
    const offset = groundOffset % 36;
    context.drawImage(
      groundDetailsCanvas,
      offset,
      0,
      WIDTH,
      groundDetailsCanvas.height,
      0,
      GROUND_Y,
      WIDTH,
      groundDetailsCanvas.height,
    );
  }

  function drawBird(frame: RenderFrame): void {
    const bob = frame.state === 'ready' ? Math.sin(frame.worldTime * 3.2) * 9 : 0;
    const y = frame.birdY + bob;
    const rotation = frame.state === 'ready'
      ? -0.08
      : Math.max(-0.42, Math.min(0.86, frame.velocity / 590));
    const { bird } = frame;
    context.save();
    context.translate(BIRD_X, y);
    context.rotate(rotation);

    if (frame.invulnerable > 0) {
      context.beginPath();
      context.arc(0, 0, 32 + Math.sin(frame.worldTime * 18) * 2, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(111, 220, 227, .76)';
      context.lineWidth = 3;
      context.stroke();
    }

    context.fillStyle = 'rgba(66, 91, 77, .17)';
    context.beginPath();
    context.ellipse(-2, 18, 22, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bird.tail;
    context.beginPath();
    context.moveTo(-19, 1);
    context.lineTo(-31, -7);
    context.lineTo(-28, 7);
    context.closePath();
    context.fill();
    context.fillStyle = bird.body;
    context.beginPath();
    context.ellipse(-2, 0, 22, 16, -0.06, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = bird.belly;
    context.beginPath();
    context.ellipse(2, 7, 13, 8, 0.12, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.translate(-7, 1);
    context.rotate(Math.sin(frame.worldTime * 20) * 0.43 - 0.13);
    context.fillStyle = bird.wing;
    context.beginPath();
    context.ellipse(-2, 0, 12, 7.5, -0.28, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255, 225, 145, .55)';
    context.beginPath();
    context.ellipse(-3, -2, 7, 2, -0.28, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = '#fffdf4';
    context.beginPath();
    context.ellipse(11, -8, 6, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#37454a';
    context.beginPath();
    context.arc(13, -8, 2.6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.beginPath();
    context.arc(13.8, -9, 0.85, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ee8350';
    context.beginPath();
    context.moveTo(19, -1);
    context.quadraticCurveTo(33, 1, 30, 6);
    context.lineTo(19, 7);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawCoin(): void {
    context.beginPath();
    context.ellipse(0, 0, 10, 13, 0, 0, Math.PI * 2);
    context.fillStyle = '#e6a62e';
    context.fill();
    context.beginPath();
    context.ellipse(0, -1, 7, 10, 0, 0, Math.PI * 2);
    context.fillStyle = pickupColors.coin;
    context.fill();
    context.strokeStyle = 'rgba(255, 246, 191, .92)';
    context.lineWidth = 1.6;
    context.beginPath();
    context.ellipse(0, -1, 3.4, 6, 0, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#fff7c9';
    context.fillRect(-0.8, -5, 1.6, 8);
  }

  function drawGem(): void {
    context.beginPath();
    context.moveTo(0, -13);
    context.lineTo(11, -5);
    context.lineTo(8, 9);
    context.lineTo(0, 14);
    context.lineTo(-8, 9);
    context.lineTo(-11, -5);
    context.closePath();
    context.fillStyle = pickupColors.gem;
    context.fill();
    context.strokeStyle = '#d7ffff';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = 'rgba(255, 255, 255, .7)';
    context.beginPath();
    context.moveTo(0, -9);
    context.lineTo(5, -4);
    context.lineTo(0, 7);
    context.closePath();
    context.fill();
  }

  function drawStar(): void {
    context.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 14 : 6.5;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fillStyle = pickupColors.star;
    context.fill();
    context.strokeStyle = '#fff3bb';
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(-3, -4, 2, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 255, 255, .75)';
    context.fill();
  }

  function drawPickup(pickup: Pickup, worldTime: number): void {
    if (
      pickup.collected
      || pickup.x < -28
      || pickup.x > WIDTH + 28
      || pickup.y < -28
      || pickup.y > HEIGHT + 28
    ) return;
    const pulse = 1 + Math.sin(worldTime * 6 + pickup.x * 0.02) * 0.08;
    context.save();
    context.translate(pickup.x, pickup.y);
    context.scale(pulse, pulse);
    if (pickup.type === 'coin') {
      drawCoin();
    } else if (pickup.type === 'gem') {
      drawGem();
    } else if (pickup.type === 'star') {
      drawStar();
    } else {
      context.beginPath();
      context.arc(0, 0, 15, 0, Math.PI * 2);
      context.fillStyle = pickupColors[pickup.type];
      context.fill();
      context.strokeStyle = 'rgba(255, 255, 255, .92)';
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = '#fff';
      context.font = '900 15px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(pickupLabels[pickup.type], 0, 1);
    }
    context.restore();
  }

  function drawParticles(): void {
    for (const particle of particles) {
      context.globalAlpha = particle.life / particle.maxLife;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawToast(frame: RenderFrame): void {
    if (frame.toastTimer <= 0 || frame.state !== 'playing') return;
    context.save();
    context.globalAlpha = Math.min(1, frame.toastTimer * 2);
    context.font = '800 12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const width = Math.min(WIDTH - 40, context.measureText(frame.toastText).width + 30);
    roundedRect((WIDTH - width) / 2, 205, width, 34, 17);
    context.fillStyle = 'rgba(255, 253, 241, .88)';
    context.fill();
    context.fillStyle = '#38575c';
    context.fillText(frame.toastText, WIDTH / 2, 222, width - 20);
    context.restore();
  }

  function render(frame: RenderFrame): void {
    if (styledWorld !== frame.world) {
      styledWorld = frame.world;
      styles = createStyles(styledWorld);
      rebuildBackground();
    }
    drawBackground(frame.worldTime);
    for (const pipe of frame.pipes) {
      if (pipe.x < WIDTH && pipe.x + PIPE_WIDTH > 0) drawPipe(pipe);
      for (const pickup of pipe.pickups) drawPickup(pickup, frame.worldTime);
    }
    drawGround(frame.groundOffset);
    drawParticles();
    drawBird(frame);
    drawToast(frame);
  }

  styles = createStyles('meadow');
  rebuildBackground();

  return { addParticles, clearParticles, render, resize, updateParticles };
}
