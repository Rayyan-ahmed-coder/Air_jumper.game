import { createSoundController } from './audio.ts';
import { GAME_CONFIG } from './gameConfig.ts';
import { canDespawnPipe, isPickupCollected } from './pickups.ts';
import { collidesWithPipe, createPipe as buildPipe } from './pipes.ts';
import { loadBestScore, loadSoundEnabled, saveBestScore, saveSoundEnabled } from './preferences.ts';
import { BIRDS, createProgression } from './progression.ts';
import { createRenderer } from './renderer.ts';
import type { GameState, Pipe, RenderFrame } from './types.ts';
import { getWorldForScore } from './worlds.ts';

const { groundY: GROUND_Y, width: VIEW_WIDTH, birdX: BIRD_X, birdStartY: BIRD_START_Y } = GAME_CONFIG.world;
const { width: PIPE_WIDTH, spacing: PIPE_SPACING } = GAME_CONFIG.pipes;
const { physics, pipes: pipeConfig, powerUps, scoring, pickups, countdown: countdownConfig } = GAME_CONFIG;

function requireElement<T extends Element>(id: string, type: { new (...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Required game element #${id} is missing or has the wrong type.`);
  }
  return element;
}

function startGame(): void {
  const canvas = requireElement('gameCanvas', HTMLCanvasElement);
  const frame = requireElement('gameFrame', HTMLElement);
  const overlay = requireElement('overlay', HTMLElement);
  const hud = requireElement('hud', HTMLElement);
  const scoreLabel = requireElement('score', HTMLElement);
  const bestLabel = requireElement('bestScore', HTMLElement);
  const playButton = requireElement('playButton', HTMLButtonElement);
  const playLabel = requireElement('playLabel', HTMLElement);
  const playIcon = requireElement('playIcon', Element);
  const panelTitle = requireElement('panelTitle', HTMLElement);
  const panelCopy = requireElement('panelCopy', HTMLElement);
  const eyebrow = requireElement('eyebrow', HTMLElement);
  const soundToggle = requireElement('soundToggle', HTMLButtonElement);
  const soundIcon = requireElement('soundIcon', Element);
  const soundLabel = requireElement('soundLabel', HTMLElement);
  const pauseButton = requireElement('pauseButton', HTMLButtonElement);
  const walletButton = requireElement('walletButton', HTMLButtonElement);
  const walletCount = requireElement('walletCount', HTMLElement);
  const shopDialog = requireElement('shopDialog', HTMLDialogElement);
  const shopClose = requireElement('shopClose', HTMLButtonElement);
  const shopCoinCount = requireElement('shopCoinCount', HTMLElement);
  const shopNote = requireElement('shopNote', HTMLElement);
  const powerStatus = requireElement('powerStatus', HTMLElement);
  const comboStatus = requireElement('comboStatus', HTMLElement);
  const countdownLabel = requireElement('countdown', HTMLElement);
  const challengeMeter = requireElement('challengeMeter', HTMLElement);
  const challengeMeterFill = requireElement('challengeMeterFill', HTMLElement);
  const challengeCount = requireElement('challengeCount', HTMLElement);
  const challengeNote = requireElement('challengeNote', HTMLElement);
  const regionLabel = requireElement('regionLabel', HTMLElement);
  const journalBest = requireElement('journalBest', HTMLElement);
  const journalCoins = requireElement('journalCoins', HTMLElement);
  const journalBird = requireElement('journalBird', HTMLElement);
  const journalShopButton = requireElement('journalShopButton', HTMLButtonElement);
  const birdGrid = requireElement('birdGrid', HTMLElement);

  let state: GameState = 'ready';
  let birdY = BIRD_START_Y;
  let velocity = 0;
  let score = 0;
  let best = 0;
  let pipes: Pipe[] = [];
  let worldTime = 0;
  let lastFrame: number | null = null;
  let frameRequest = 0;
  let gameVisible = true;
  let groundOffset = 0;
  let soundOn = true;
  let pipeCount = 0;
  let runCoins = 0;
  let streak = 0;
  let shieldCharges = 0;
  let invulnerable = 0;
  let magnetTimer = 0;
  let doubleCoinsTimer = 0;
  let slowFlightTimer = 0;
  let toastText = '';
  let toastTimer = 0;
  let countdownElapsed = 0;
  let countdownText = '';
  let currentRegion = getWorldForScore(0);
  const displayedPowerStatus = {
    shield: false,
    magnet: 0,
    double: 0,
    slow: 0,
  };

  const progression = createProgression();
  const renderer = createRenderer(canvas);
  const renderFrame: RenderFrame = {
    state,
    birdY,
    velocity,
    worldTime,
    groundOffset,
    invulnerable,
    pipes,
    toastText,
    toastTimer,
    bird: progression.selectedBird,
    world: currentRegion.id,
  };
  const sound = createSoundController({
    isPlaying: () => state === 'playing',
    onUnavailable: () => {
      soundOn = false;
      updateSoundButton();
    },
  });

  best = loadBestScore();
  soundOn = loadSoundEnabled();

  bestLabel.textContent = String(best);
  updateWallet();
  updateSoundButton();

  function updateSoundButton(): void {
    soundLabel.textContent = soundOn ? 'Sound on' : 'Sound off';
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    soundIcon.innerHTML = soundOn
      ? '<path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
      : '<path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m16 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
    sound.setEnabled(soundOn);
  }

  function updateBirdShop(note?: string): void {
    for (const bird of Object.values(BIRDS)) {
      const card = shopDialog.querySelector<HTMLElement>(`[data-bird-card="${bird.id}"]`);
      const button = card?.querySelector<HTMLButtonElement>('.bird-action');
      if (!card || !button) {
        throw new Error(`Bird shop is missing the "${bird.id}" card or action button.`);
      }
      const unlocked = progression.isUnlocked(bird.id);
      const selected = progression.selectedBird.id === bird.id;
      card.classList.toggle('is-selected', selected);
      button.disabled = selected;
      button.textContent = selected ? 'Selected' : unlocked ? 'Choose bird' : `Unlock · ${bird.cost}`;
      button.setAttribute(
        'aria-label',
        selected ? `${bird.name} selected` : unlocked ? `Choose ${bird.name}` : `Unlock ${bird.name} for ${bird.cost} coins`,
      );
    }
    if (note) shopNote.textContent = note;
  }

  function updateWallet(): void {
    walletCount.textContent = String(progression.coins);
    walletButton.setAttribute('aria-label', `Open bird shop. ${progression.coins} coins.`);
    shopCoinCount.textContent = `${progression.coins} ${progression.coins === 1 ? 'coin' : 'coins'}`;
    journalBest.textContent = `${best} ${best === 1 ? 'gate' : 'gates'}`;
    journalCoins.textContent = `${progression.coins} ${progression.coins === 1 ? 'coin' : 'coins'}`;
    journalBird.textContent = progression.selectedBird.name;
    updateBirdShop();
  }

  function updateChallenge(): void {
    const progress = score > 0 && score % scoring.streakLength === 0
      ? scoring.streakLength
      : score % scoring.streakLength;
    challengeMeter.setAttribute('aria-valuenow', String(progress));
    challengeCount.textContent = `${progress} / ${scoring.streakLength} gates`;
    challengeMeterFill.style.width = `${progress / scoring.streakLength * 100}%`;
    challengeNote.textContent = progress === scoring.streakLength
      ? `Streak bonus earned! Fly ${scoring.streakLength} more for another.`
      : 'Your next bonus is waiting up ahead.';
  }

  function updatePowerStatus(): void {
    const shield = shieldCharges > 0;
    const magnet = Math.ceil(magnetTimer);
    const double = Math.ceil(doubleCoinsTimer);
    const slow = Math.ceil(slowFlightTimer);
    if (
      shield === displayedPowerStatus.shield
      && magnet === displayedPowerStatus.magnet
      && double === displayedPowerStatus.double
      && slow === displayedPowerStatus.slow
    ) return;
    displayedPowerStatus.shield = shield;
    displayedPowerStatus.magnet = magnet;
    displayedPowerStatus.double = double;
    displayedPowerStatus.slow = slow;

    const activePowers: string[] = [];
    if (shield) activePowers.push('SHIELD');
    if (magnet > 0) activePowers.push(`MAGNET ${magnet}s`);
    if (double > 0) activePowers.push(`2× COINS ${double}s`);
    if (slow > 0) activePowers.push(`SLOW FLIGHT ${slow}s`);
    if (activePowers.length === 0) {
      if (!powerStatus.hidden) {
        powerStatus.hidden = true;
        powerStatus.removeAttribute('data-power');
        powerStatus.textContent = '';
      }
      return;
    }
    const nextPower = shield
      ? 'shield'
      : magnet > 0
        ? 'magnet'
        : double > 0
          ? 'double'
          : 'slow';
    if (powerStatus.dataset.power !== nextPower) powerStatus.dataset.power = nextPower;
    const nextText = activePowers.join(' · ');
    if (powerStatus.textContent !== nextText) powerStatus.textContent = nextText;
    if (powerStatus.hidden) powerStatus.hidden = false;
  }

  function enterRegionIfNeeded(): void {
    const nextRegion = getWorldForScore(score);
    if (nextRegion.id === currentRegion.id) return;

    currentRegion = nextRegion;
    regionLabel.textContent = currentRegion.name;
    runCoins += currentRegion.rewardCoins;
    if (currentRegion.rewardCoins > 0) {
      progression.addCoins(currentRegion.rewardCoins);
      updateWallet();
    }
    showToast(
      `${currentRegion.name.toUpperCase()} · REGION BONUS +${currentRegion.rewardCoins} COINS`,
      2.2,
    );
    renderer.addParticles(BIRD_X, birdY - 24, currentRegion.colors.sun, 24);
    sound.tone(660, 0.18, 'sine', 0.09, 990);
    sound.tone(990, 0.3, 'triangle', 0.07, 1480);
  }

  function setPauseIcon(paused: boolean): void {
    pauseButton.setAttribute('aria-label', paused ? 'Resume game' : 'Pause game');
    pauseButton.innerHTML = paused
      ? '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5 3.5a1 1 0 0 1 1.5-.86l7 4.5a1 1 0 0 1 0 1.72l-7 4.5A1 1 0 0 1 5 12.5v-9Z"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.5 3.5h2.7v9H4.5zm4.3 0h2.7v9H8.8z"/></svg>';
  }

  function createNextPipe(x: number): Pipe {
    pipeCount += 1;
    return buildPipe(x, pipeCount);
  }

  function showToast(message: string, duration = 1.7): void {
    toastText = message;
    toastTimer = duration;
  }

  function resetGame(): void {
    state = 'ready';
    currentRegion = getWorldForScore(0);
    regionLabel.textContent = currentRegion.name;
    birdY = BIRD_START_Y;
    velocity = 0;
    score = 0;
    pipeCount = 0;
    runCoins = 0;
    streak = 0;
    shieldCharges = 0;
    invulnerable = 0;
    magnetTimer = 0;
    doubleCoinsTimer = 0;
    slowFlightTimer = 0;
    comboStatus.hidden = true;
    countdownLabel.hidden = true;
    countdownText = '';
    countdownElapsed = 0;
    walletButton.disabled = false;
    toastTimer = 0;
    toastText = '';
    pipes = Array.from(
      { length: pipeConfig.initialCount },
      (_, index) => createNextPipe(VIEW_WIDTH + PIPE_WIDTH + index * PIPE_SPACING),
    );
    renderer.clearParticles();
    groundOffset = 0;
    scoreLabel.textContent = '0';
    updateChallenge();
    updatePowerStatus();
    scoreLabel.hidden = true;
    hud.hidden = true;
    overlay.hidden = false;
    eyebrow.textContent = 'Take a deep breath';
    panelTitle.innerHTML = 'Ready to<br>take flight?';
    panelCopy.textContent = 'A little flap goes a long way. How far can you fly?';
    playLabel.textContent = 'Let’s fly';
    playIcon.innerHTML = '<path d="M6 3.8a1 1 0 0 1 1.5-.86l9 5.2a1 1 0 0 1 0 1.73l-9 5.2a1 1 0 0 1-1.5-.86V3.8Z"/>';
    setPauseIcon(false);
  }

  function flapSound(): void {
    sound.tone(520, 0.105, 'sine', 0.105, 760);
    sound.tone(780, 0.075, 'triangle', 0.035, 560);
  }

  function beginCountdown(): void {
    if (state === 'over') resetGame();
    if (state !== 'ready') return;
    sound.ensure();
    state = 'countdown';
    countdownElapsed = 0;
    countdownText = '3';
    countdownLabel.textContent = countdownText;
    countdownLabel.hidden = false;
    walletButton.disabled = true;
    overlay.hidden = true;
    sound.tone(780, 0.11, 'sine', 0.08, 640);
    scheduleLoop();
  }

  function launchFlight(): void {
    state = 'playing';
    countdownLabel.hidden = true;
    walletButton.disabled = false;
    velocity = physics.initialVelocity;
    hud.hidden = false;
    scoreLabel.hidden = false;
    sound.startMusic();
    flapSound();
  }

  function beginGame(): void {
    beginCountdown();
  }

  function flap(): void {
    if (state === 'ready') {
      beginGame();
      return;
    }
    if (state !== 'playing') return;
    velocity = physics.flapVelocity;
    flapSound();
    renderer.addParticles(BIRD_X - 17, birdY + 3, '#fff4cc', 3);
  }

  function endGame(): void {
    if (state !== 'playing') return;
    state = 'over';
    sound.stopMusic();
    sound.tone(205, 0.28, 'triangle', 0.13, 82);
    sound.tone(120, 0.34, 'sine', 0.1, 58);
    const newBest = score > best;
    if (newBest) {
      best = score;
      bestLabel.textContent = String(best);
      saveBestScore(best);
      updateWallet();
    }
    overlay.hidden = false;
    eyebrow.textContent = newBest ? 'A new personal best!' : 'Every flight makes you better';
    panelTitle.innerHTML = score === 0 ? 'So close!' : 'Lovely<br>flying.';
    panelCopy.textContent = `You flew through ${score} ${score === 1 ? 'gate' : 'gates'} and collected ${runCoins} ${runCoins === 1 ? 'coin' : 'coins'}. Bank: ${progression.coins}. Best: ${best}.`;
    playLabel.textContent = 'Fly again';
    playIcon.innerHTML = '<path d="M5.2 5.2a6.8 6.8 0 0 1 11.4 3.1H19l-3.7 3.8-3.7-3.8h2.3a4.1 4.1 0 0 0-6.6-1.2l-2.1-1.9Zm13.6 9.6a6.8 6.8 0 0 1-11.4-3.1H5l3.7-3.8 3.7 3.8h-2.3a4.1 4.1 0 0 0 6.6 1.2l2.1 1.9Z"/>';
  }

  function togglePause(): void {
    if (state === 'playing') {
      state = 'paused';
      sound.stopMusic();
      overlay.hidden = false;
      eyebrow.textContent = 'Catch your breath';
      panelTitle.textContent = 'Flight paused';
      panelCopy.textContent = 'Your clouds will wait right where you left them.';
      playLabel.textContent = 'Keep flying';
      playIcon.innerHTML = '<path d="M6 3.8a1 1 0 0 1 1.5-.86l9 5.2a1 1 0 0 1 0 1.73l-9 5.2a1 1 0 0 1-1.5-.86V3.8Z"/>';
      setPauseIcon(true);
    } else if (state === 'paused') {
      state = 'playing';
      overlay.hidden = true;
      sound.startMusic();
      setPauseIcon(false);
      lastFrame = null;
      scheduleLoop();
    }
  }

  function collectPickup(pickup: Pipe['pickups'][number]): void {
    pickup.collected = true;
    if (pickup.type === 'coin' || pickup.type === 'gem' || pickup.type === 'star') {
      const baseValue = pickup.type === 'star'
        ? pickups.starCoinValue
        : pickup.type === 'gem'
          ? scoring.gemCoinValue
          : 1;
      const value = baseValue * (doubleCoinsTimer > 0 ? 2 : 1);
      runCoins += value;
      progression.addCoins(value);
      updateWallet();
      const color = pickup.type === 'gem' ? '#8df4ee' : '#ffe17a';
      const effectCount = pickup.type === 'star' ? 18 : pickup.type === 'gem' ? 14 : 7;
      renderer.addParticles(pickup.x, pickup.y, color, effectCount);
      const label = pickup.type === 'star' ? 'GOLD STAR' : pickup.type === 'gem' ? 'GEM' : 'COIN';
      showToast(`${label} +${value} COINS`, 1);
      sound.tone(pickup.type === 'star' ? 1480 : pickup.type === 'gem' ? 1160 : 920, 0.12, 'sine', 0.07, 1640);
      return;
    }

    switch (pickup.type) {
      case 'shield':
        shieldCharges = 1;
        showToast('SHIELD READY · ONE SAFE PASS');
        renderer.addParticles(pickup.x, pickup.y, '#8ce9eb', 13);
        sound.tone(460, 0.22, 'sine', 0.1, 930);
        sound.tone(930, 0.28, 'triangle', 0.055, 1240);
        break;
      case 'magnet':
        magnetTimer = Math.min(
          magnetTimer + powerUps.magnet.duration,
          powerUps.magnet.maxDuration,
        );
        showToast('COIN MAGNET · COINS COME TO YOU');
        renderer.addParticles(pickup.x, pickup.y, '#c3a6ff', 13);
        sound.tone(580, 0.2, 'sine', 0.09, 1040);
        sound.tone(1040, 0.3, 'triangle', 0.05, 1480);
        break;
      case 'double':
        doubleCoinsTimer = Math.min(
          doubleCoinsTimer + powerUps.double.duration,
          powerUps.double.maxDuration,
        );
        showToast('DOUBLE COINS · GRAB EVERY COIN!');
        renderer.addParticles(pickup.x, pickup.y, '#ffc16f', 15);
        sound.tone(680, 0.2, 'sine', 0.09, 1120);
        sound.tone(1120, 0.28, 'triangle', 0.05, 1520);
        break;
      case 'slow':
        slowFlightTimer = Math.min(
          slowFlightTimer + powerUps.slow.duration,
          powerUps.slow.maxDuration,
        );
        showToast('SLOW FLIGHT · TAKE YOUR TIME');
        renderer.addParticles(pickup.x, pickup.y, '#9fcaff', 15);
        sound.tone(740, 0.25, 'sine', 0.09, 520);
        sound.tone(520, 0.3, 'triangle', 0.05, 390);
        break;
      default:
        break;
    }
    updatePowerStatus();
  }

  function collideWithPipe(pipe: Pipe): void {
    if (!collidesWithPipe(birdY, pipe) || invulnerable > 0) return;
    if (shieldCharges > 0) {
      shieldCharges = 0;
      invulnerable = powerUps.shield.invulnerabilityDuration;
      velocity = physics.shieldBounceVelocity;
      showToast('SHIELD SAVED YOUR FLIGHT!');
      renderer.addParticles(BIRD_X, birdY, '#93f3eb', 20);
      sound.tone(300, 0.18, 'triangle', 0.1, 1180);
      updatePowerStatus();
    } else {
      endGame();
    }
  }

  function update(delta: number): void {
    worldTime += delta;
    if (toastTimer > 0) toastTimer -= delta;
    if (state === 'countdown') {
      countdownElapsed += delta;
      const count = countdownConfig.seconds - Math.floor(countdownElapsed);
      const nextText = count > 0
        ? String(count)
        : countdownElapsed < countdownConfig.seconds + countdownConfig.goDuration
          ? 'GO!'
          : '';
      if (nextText && nextText !== countdownText) {
        countdownText = nextText;
        countdownLabel.textContent = countdownText;
        sound.tone(nextText === 'GO!' ? 1120 : 780, 0.11, 'sine', 0.08, nextText === 'GO!' ? 1460 : 640);
      }
      if (countdownElapsed >= countdownConfig.seconds + countdownConfig.goDuration) {
        launchFlight();
      }
      return;
    }
    if (state !== 'playing') return;
    velocity = Math.min(velocity + physics.gravity * delta, physics.maxFallVelocity);
    birdY += velocity * delta;
    const speed = Math.min(
      physics.basePipeSpeed + score * physics.speedPerGate,
      physics.maxPipeSpeed,
    ) * (slowFlightTimer > 0 ? physics.slowFlightSpeedMultiplier : 1);
    groundOffset += speed * delta;
    invulnerable = Math.max(0, invulnerable - delta);
    magnetTimer = Math.max(0, magnetTimer - delta);
    doubleCoinsTimer = Math.max(0, doubleCoinsTimer - delta);
    slowFlightTimer = Math.max(0, slowFlightTimer - delta);
    updatePowerStatus();

    for (const pipe of pipes) {
      const previousX = pipe.x;
      pipe.x -= speed * delta;
      pipe.top = pipe.baseTop + Math.sin(worldTime * pipeConfig.motionRate + pipe.motionPhase) * pipe.motionAmplitude;
      const verticalOffset = pipe.top - pipe.previousTop;
      pipe.previousTop = pipe.top;
      for (const pickup of pipe.pickups) {
        if (pickup.collected) continue;
        pickup.x -= previousX - pipe.x;
        pickup.y += verticalOffset;
        if ((pickup.type === 'coin' || pickup.type === 'gem' || pickup.type === 'star') && magnetTimer > 0) {
          const dx = BIRD_X - pickup.x;
          const dy = birdY - pickup.y;
          if (dx * dx + dy * dy < pickups.magnetAttractionRadius ** 2) {
            const pull = Math.min(1, delta * pickups.magnetPullRate);
            pickup.x += dx * pull;
            pickup.y += dy * pull;
          }
        }
        if (isPickupCollected(BIRD_X, birdY, pickup, magnetTimer > 0)) collectPickup(pickup);
      }

      if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
        pipe.scored = true;
        score += 1;
        streak += 1;
        updateChallenge();
        scoreLabel.textContent = String(score);
        comboStatus.hidden = streak < 3;
        comboStatus.textContent = streak >= 3 ? `${streak} GATE STREAK` : '';
        sound.tone(760, 0.15, 'sine', 0.11, 1140);
        sound.tone(1140, 0.19, 'triangle', 0.035, 1420);
        if (streak % scoring.streakLength === 0) {
          runCoins += scoring.streakBonusCoins;
          progression.addCoins(scoring.streakBonusCoins);
          updateWallet();
          showToast(`${streak} GATE STREAK · BONUS +${scoring.streakBonusCoins} COINS`);
          challengeNote.textContent = `Streak bonus earned! +${scoring.streakBonusCoins} coins.`;
          renderer.addParticles(BIRD_X, birdY - 24, '#fff0a2', 16);
          sound.tone(660, 0.15, 'sine', 0.08, 880);
          sound.tone(880, 0.24, 'triangle', 0.075, 1320);
        }
        enterRegionIfNeeded();
      }
      collideWithPipe(pipe);
      if (state !== 'playing') break;
    }

    while (pipes.length && canDespawnPipe(pipes[0], PIPE_WIDTH)) {
      pipes.shift();
      const last = pipes[pipes.length - 1];
      if (last) pipes.push(createNextPipe(Math.max(
        VIEW_WIDTH + pipeConfig.respawnEdgeOffset,
        last.x + PIPE_SPACING,
      )));
    }

    renderer.updateParticles(delta);
    if (birdY > GROUND_Y - physics.groundCollisionPadding || birdY < physics.topBoundary) endGame();
  }

  function render(): void {
    renderFrame.state = state;
    renderFrame.birdY = birdY;
    renderFrame.velocity = velocity;
    renderFrame.worldTime = worldTime;
    renderFrame.groundOffset = groundOffset;
    renderFrame.invulnerable = invulnerable;
    renderFrame.pipes = pipes;
    renderFrame.toastText = toastText;
    renderFrame.toastTimer = toastTimer;
    renderFrame.bird = progression.selectedBird;
    renderFrame.world = currentRegion.id;
    renderer.render(renderFrame);
  }

  function loop(timestamp: number): void {
    frameRequest = 0;
    if (document.hidden || !gameVisible || state === 'paused' || state === 'over') return;

    const targetFps = state === 'ready'
      ? GAME_CONFIG.rendering.idleFramesPerSecond
      : GAME_CONFIG.rendering.maxFramesPerSecond;
    const frameInterval = 1000 / targetFps;
    if (lastFrame !== null && timestamp - lastFrame < frameInterval) {
      scheduleLoop();
      return;
    }
    const delta = lastFrame === null
      ? 0
      : Math.min((timestamp - lastFrame) / 1000, physics.maxFrameDelta);
    lastFrame = timestamp;
    update(delta);
    render();
    scheduleLoop();
  }

  function scheduleLoop(): void {
    if (
      frameRequest === 0
      && !document.hidden
      && gameVisible
      && state !== 'paused'
      && state !== 'over'
    ) {
      frameRequest = requestAnimationFrame(loop);
    }
  }

  playButton.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state === 'paused') {
      togglePause();
      return;
    }
    if (state === 'over') resetGame();
    beginGame();
  });

  frame.addEventListener('pointerdown', (event) => {
    if (event.target === pauseButton || (event.target instanceof Node && pauseButton.contains(event.target)) || !overlay.hidden) return;
    flap();
  });

  pauseButton.addEventListener('click', togglePause);

  walletButton.addEventListener('click', () => {
    if (state === 'countdown') return;
    if (state === 'playing') togglePause();
    updateBirdShop('Fly through hoops to earn coins, then pick a new look.');
    shopDialog.showModal();
  });

  journalShopButton.addEventListener('click', () => walletButton.click());

  shopClose.addEventListener('click', () => shopDialog.close());
  shopDialog.addEventListener('click', (event) => {
    if (event.target === shopDialog) shopDialog.close();
  });

  birdGrid.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-bird]');
    const bird = Object.values(BIRDS).find((candidate) => candidate.id === button?.dataset.bird);
    if (!button || button.disabled || !bird) return;

    const result = progression.chooseBird(bird.id);
    if (result.status === 'insufficient') {
      updateBirdShop(`Collect ${bird.cost - progression.coins} more coins to unlock ${bird.name}.`);
    } else if (result.status === 'unlocked') {
      updateWallet();
      shopNote.textContent = `${bird.name} joined your flock!`;
    } else if (result.status === 'selected') {
      updateWallet();
      shopNote.textContent = `${bird.name} is ready for takeoff!`;
    }
  });

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    saveSoundEnabled(soundOn);
    if (soundOn) sound.ensure();
    updateSoundButton();
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (shopDialog.open && (event.code === 'Space' || event.code === 'ArrowUp')) return;
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      event.preventDefault();
      if (state === 'paused') return;
      if (state === 'over') {
        resetGame();
        beginGame();
        return;
      }
      if (!overlay.hidden) {
        beginGame();
        return;
      }
      flap();
    } else if (event.code === 'Escape' && (state === 'playing' || state === 'paused')) {
      togglePause();
    }
  });

  const canvasResizeObserver = new ResizeObserver(renderer.resize);
  canvasResizeObserver.observe(frame);
  window.addEventListener('resize', renderer.resize, { passive: true });
  const gameVisibilityObserver = new IntersectionObserver(([entry]) => {
    gameVisible = entry.isIntersecting;
    if (gameVisible) {
      lastFrame = null;
      scheduleLoop();
    }
  });
  gameVisibilityObserver.observe(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
    if (!document.hidden) {
      lastFrame = null;
      scheduleLoop();
    }
  });

  resetGame();
  renderer.resize();
  scheduleLoop();
}

startGame();