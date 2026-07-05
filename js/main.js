const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const startButton = document.getElementById('startButton');
const retryButton = document.getElementById('retryButton');
const finalMessage = document.getElementById('finalMessage');
const hitFlash = document.getElementById('hitFlash');
const coinScoreEl = document.getElementById('coinScore');
const bestScoreEl = document.getElementById('bestScore');

const game_config = {
    gravity: 0.42,
    jumpStrength: -8.6,
    pipeGap: 200,
    groundHeight: 64,
    birdRadius: 16,
    pipeSpawnRate: 100,
    coinSpawnRate: 110,
    treeSpawnRate: 20,
    pipeSpeed: 3.65,
    treeSpeed: 3.7,
    difficultyRamp: 0.2
};

const PIE_2 = Math.PI * 2;
const BASE_WIDTH = 820;
const BASE_HEIGHT = 620;
const STORAGE_KEY = 'air-jumper-stats';
let width = BASE_WIDTH;
let height = BASE_HEIGHT;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let bird;
let pipes;
let clouds;
let stars;
let trees;
let bushes;
let coins;
let frameCount;
let score;
let coinCount = 0;
let bestScore = 0;
let running = false;
let gameState = 'start';
let lastPipeTime = 0;
let lastCoinTime = 0;
let lastTreeTime = 0;
let lastBushTime = 0;
let flashTimer = 0;
let lastFrameTime = 0;
let animationFrameId = null;

function loadStoredStats() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return;

        const parsed = JSON.parse(stored);
        if (typeof parsed?.bestScore === 'number' && Number.isFinite(parsed.bestScore)) {
            bestScore = parsed.bestScore;
        }
        if (typeof parsed?.coinCount === 'number' && Number.isFinite(parsed.coinCount)) {
            coinCount = parsed.coinCount;
        }
    } catch (error) {
        console.warn('Unable to load saved stats', error);
    }
}

function saveStoredStats() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestScore, coinCount }));
    } catch (error) {
        console.warn('Unable to save stats', error);
    }
}

class Bird {
    constructor() {
        this.gradient = ctx.createRadialGradient(-4, -4, 4, 0, 0, game_config.birdRadius * 1.5);
        this.gradient.addColorStop(0, '#fff7b8');
        this.gradient.addColorStop(0.25, '#ffd166');
        this.gradient.addColorStop(1, '#f6ae2d');
        this.x = width * 0.22;
        this.y = height / 2;
        this.velocity = 0;
        this.rotation = 0;
    }

    update(dt) {
        const frameScale = dt / 16.67;
        this.velocity += game_config.gravity * frameScale;
        this.y += this.velocity * frameScale;
        this.rotation = Math.min(Math.max(this.velocity / 16, -0.7), 1.0);

        if (this.y < game_config.birdRadius) {
            this.y = game_config.birdRadius;
            this.velocity = 0;
        }
    }

    jump() {
        this.velocity = game_config.jumpStrength;
    }

    getBounds() {
        return {
            left: this.x - game_config.birdRadius,
            right: this.x + game_config.birdRadius,
            top: this.y - game_config.birdRadius,
            bottom: this.y + game_config.birdRadius,
        };
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        ctx.fillStyle = this.gradient;
        ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(0, 0, game_config.birdRadius, 0, PIE_2);
        ctx.fill();

        ctx.fillStyle = '#162a44';
        ctx.beginPath();
        ctx.arc(6, -2, 4.5, 0, PIE_2);
        ctx.fill();

        ctx.strokeStyle = '#1a49a1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 2, 22, 0, PIE_2);
        ctx.stroke();

        ctx.restore();
    }
}

class Pipe {
    constructor() {
        this.width = 78;
        this.x = width + this.width;
        this.top = 65 + Math.random() * 250;
        this.bottom = this.top + game_config.pipeGap;
        this.passed = false;
        this.speed = game_config.pipeSpeed + Math.random() * 0.25 + Math.min(score * game_config.difficultyRamp, 1.2) * 0.3;
        this.topHeight = this.top;
        this.bottomY = this.bottom;
        this.bottomHeight = height - this.bottomY;
        this.capHeight = 24;
        this.capOffset = 4;
    }

    update(dt) {
        this.x -= this.speed * (dt / 16.67);
    }

    draw() {
        ctx.save();
        const colors = ['#1c9c34', '#28eb59', '#74f193', '#1bd148', '#0f7d2a'];

        const pipeGradient = ctx.createLinearGradient(this.x, 0, this.x + this.width, 0);
        pipeGradient.addColorStop(0.0, colors[0]);
        pipeGradient.addColorStop(0.15, colors[1]);
        pipeGradient.addColorStop(0.4, colors[2]);
        pipeGradient.addColorStop(0.7, colors[3]);
        pipeGradient.addColorStop(1.0, colors[4]);

        ctx.fillStyle = pipeGradient;
        ctx.shadowColor = 'rgba(69, 118, 255, 0.45)';
        ctx.shadowBlur = 16;
        ctx.fillRect(this.x, 0, this.width, this.topHeight);
        ctx.fillRect(this.x, this.bottomY, this.width, this.bottomHeight);
        ctx.shadowBlur = 0;

        const capGradient = ctx.createLinearGradient(this.x - this.capOffset, 0, this.x + this.width + this.capOffset, 0);
        capGradient.addColorStop(0.0, colors[0]);
        capGradient.addColorStop(0.15, colors[1]);
        capGradient.addColorStop(0.4, colors[2]);
        capGradient.addColorStop(0.7, colors[3]);
        capGradient.addColorStop(1.0, colors[4]);
        ctx.fillStyle = capGradient;

        ctx.fillRect(this.x - this.capOffset, this.topHeight - this.capHeight, this.width + this.capOffset * 2, this.capHeight);
        ctx.fillRect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, this.capHeight);

        ctx.fillStyle = '#112b41';
        ctx.fillRect(this.x - this.capOffset, this.topHeight - 4, this.width + this.capOffset * 2, 4);
        ctx.fillRect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, 4);

        ctx.strokeStyle = '#0a1d2d';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, 0, this.width, this.topHeight - this.capHeight);
        ctx.strokeRect(this.x - this.capOffset, this.topHeight - this.capHeight, this.width + this.capOffset * 2, this.capHeight);
        ctx.strokeRect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, this.capHeight);
        ctx.strokeRect(this.x, this.bottomY + this.capHeight, this.width, this.bottomHeight - this.capHeight);
        ctx.restore();
    }


    collidesWith(bird) {
        const b = bird.getBounds();
        const hitX = b.right > this.x && b.left < this.x + this.width;
        const hitTop = b.top < this.top;
        const hitBottom = b.bottom > this.bottom;
        return hitX && (hitTop || hitBottom);
    }
}

class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 20;
        this.collected = false;
    }

    update(dt) {
        this.x -= this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.4) * 0.3;
    }

    draw() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, PIE_2);
        ctx.closePath();
        ctx.fillStyle = '#ffd22e';
        ctx.shadowColor = 'rgba(233, 200, 94, 0.81)';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.strokeStyle = 'rgb(255, 114, 32)';
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.arc(this.x, this.y, this.size / 2 + 2, 0, PIE_2);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    collidesWith(bird) {
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;

        const distance =
            Math.sqrt(dx * dx + dy * dy);

        return distance < game_config.birdRadius + this.size / 2;
    }
}

class Tree {
    constructor() {
        this.scale = 0.7 + Math.random() * 0.7;
        this.y = height - game_config.groundHeight + Math.max(Math.random() * 10, 4);
        this.x = width + 40;
        this.speed = game_config.treeSpeed - (this.scale / 3.5) + Math.min(score * game_config.difficultyRamp, 1.2);
    }

    update(dt) {
        this.x -= this.speed * (dt / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        ctx.fillStyle = '#5c3a21';
        ctx.beginPath();
        ctx.moveTo(-6, -25);
        ctx.lineTo(6, -25);
        ctx.lineTo(8, 0);
        ctx.quadraticCurveTo(12, 0, 14, 2);
        ctx.lineTo(-14, 2);
        ctx.quadraticCurveTo(-12, 0, -8, 0);
        ctx.closePath();
        ctx.fill();

        // Bottom
        ctx.fillStyle = '#143d31';
        ctx.beginPath();
        ctx.moveTo(-35, -20);
        ctx.quadraticCurveTo(0, -14, 35, -20);
        ctx.lineTo(0, -55);
        ctx.closePath();
        ctx.fill();
        // Middle
        ctx.fillStyle = '#1b5e43';
        ctx.beginPath();
        ctx.moveTo(-28, -45);
        ctx.quadraticCurveTo(0, -39, 28, -45);
        ctx.lineTo(0, -80);
        ctx.closePath();
        ctx.fill();
        // Top
        ctx.fillStyle = '#227d58';
        ctx.beginPath();
        ctx.moveTo(-20, -68);
        ctx.quadraticCurveTo(0, -63, 20, -68);
        ctx.lineTo(0, -102);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

class Cloud {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = width + Math.random() * 220;
        this.y = 30 + Math.random() * (height * 0.3);
        this.scale = 0.7 + Math.random() * 0.8;
        this.speed = 0.3 + Math.random() * 0.6;
    }

    update(dt) {
        this.x -= this.speed * (dt / 16.67);
        if (this.x + 180 * this.scale < -20) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.44)';
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, PIE_2);
        ctx.arc(28, -10, 24, 0, PIE_2);
        ctx.arc(56, 0, 28, 0, PIE_2);
        ctx.arc(30, 12, 24, 0, PIE_2);
        ctx.fill();
        ctx.restore();
    }
}

class Star {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * (height * 0.48);
        this.radius = 0.7 + Math.random() * 2.2;
        this.alpha = 0.35 + Math.random() * 0.6;
        this.phase = Math.random() * PIE_2;
        this.speed = 0.018 + Math.random() * 0.014;
    }

    draw() {
        const pulse = 0.6 + 0.4 * Math.sin(this.phase);
        ctx.fillStyle = `rgba(255,255,255,${this.alpha * pulse})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, PIE_2);
        ctx.fill();
    }

    update() {
        this.phase += this.speed;
    }
}

function resizeCanvas() {
    const maxWidth = Math.min(window.innerWidth - 24, BASE_WIDTH);
    const maxHeight = Math.min(window.innerHeight - 24, BASE_HEIGHT);
    const scale = Math.min(maxWidth / BASE_WIDTH, maxHeight / BASE_HEIGHT, 1);

    canvas.style.width = `${Math.round(BASE_WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(BASE_HEIGHT * scale)}px`;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(BASE_WIDTH * dpr);
    canvas.height = Math.round(BASE_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    width = BASE_WIDTH;
    height = BASE_HEIGHT;

    if (gameState === 'running') {
        initGame();
    } else if (bird) {
        bird.x = width * 0.22;
        bird.y = height / 2;
    }
}

function updateHud() {
    scoreEl.textContent = score;
    if (coinScoreEl) {
        coinScoreEl.textContent = coinCount;
    }
    if (bestScoreEl) {
        bestScoreEl.textContent = bestScore;
    }
}

function initGame({ jumpImmediately = true } = {}) {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    bird = new Bird();
    pipes = [];
    clouds = Array.from({ length: window.innerWidth > 768 ? 6 : 4 }, () => new Cloud());
    stars = Array.from({ length: Math.max(36, Math.min(70, Math.round((width / BASE_WIDTH) * 70))) }, () => new Star());
    trees = [];
    bushes = [];
    coins = [];
    frameCount = 0;
    score = 0;
    flashTimer = 0;
    lastFrameTime = 0;
    lastPipeTime = 0;
    lastCoinTime = 0;
    lastTreeTime = 0;
    lastBushTime = 0;
    running = true;
    gameState = 'running';
    updateHud();
    startOverlay.classList.remove('visible');
    gameOverOverlay.classList.remove('visible');
    if (jumpImmediately && bird) {
        bird.jump();
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
    running = false;
    gameState = 'over';
    bestScore = Math.max(bestScore, score);
    saveStoredStats();
    updateHud();
    finalMessage.textContent = `Score: ${score} · Best: ${bestScore} · Coins: ${coinCount}`;
    gameOverOverlay.classList.add('visible');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function triggerFlash() {
    flashTimer = 4;
    hitFlash.classList.add('active');
}

function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#23b8f0');
    sky.addColorStop(0.5, '#1a93ce');
    sky.addColorStop(1, '#2a66dd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 7; i++) {
        const y = 120 + i * 70 + Math.sin(frameCount * 0.01 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(width * 0.2, y - 32, width * 0.4, y);
        ctx.quadraticCurveTo(width * 0.6, y + 28, width * 0.8, y - 10);
        ctx.quadraticCurveTo(width, y - 18, width, y + 20);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
    }

    stars.forEach(star => star.draw());
    clouds.forEach(cloud => cloud.draw());
}

function drawGround() {
    ctx.fillStyle = '#1ea31a';
    ctx.fillRect(0, height - game_config.groundHeight, width, game_config.groundHeight);
    ctx.fillStyle = 'rgba(30, 141, 30, 0.6)';
    ctx.fillRect(0, height - game_config.groundHeight, width, 4);
}

function drawParticles() {
    const count = 12;
    for (let i = 0; i < count; i++) {
        const offset = Math.sin((frameCount + i * 18) * 0.07) * 4;
        ctx.fillStyle = `rgba(255, 217, 104, ${0.08 + 0.04 * Math.sin((frameCount + i) * 0.33)})`;
        ctx.beginPath();
        ctx.arc(bird.x - 16 - i * 3 + offset, bird.y + 6 + (i % 3) * 3, 2.6, 0, PIE_2);
        ctx.fill();
    }
}

function gameLoop(timestamp) {
    if (!running) return;

    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const dt = Math.min(timestamp - lastFrameTime, 32);
    lastFrameTime = timestamp;
    frameCount += 1;

    ctx.clearRect(0, 0, width, height);
    drawBackground();
    stars.forEach(star => star.update());
    clouds.forEach(cloud => cloud.update(dt));
    drawParticles();
    drawGround();
    trees.forEach(tree => tree.update(dt));
    trees.forEach(tree => tree.draw());
    bird.update(dt);
    bird.draw();

    if (frameCount - lastPipeTime > game_config.pipeSpawnRate - Math.min(score * game_config.difficultyRamp, 18)) {
        pipes.push(new Pipe());
        lastPipeTime = frameCount;
    }

    if (pipes.length > 12) {
        pipes.splice(0, pipes.length - 12);
    }
    if (frameCount - lastTreeTime > game_config.treeSpawnRate - Math.min(score * game_config.difficultyRamp, 16)) {
        trees.push(new Tree());
        lastTreeTime = frameCount;
    }
    if (frameCount - lastCoinTime > game_config.coinSpawnRate) {
        const minY = 100;
        const maxY = height - game_config.groundHeight - 100;
        coins.push(new Coin(width + 40, minY + Math.random() * (maxY - minY)));
        lastCoinTime = frameCount;
    }

    pipes.forEach(pipe => pipe.update(dt));
    pipes = pipes.filter(pipe => pipe.x + pipe.width > -20);
    coins.forEach(coin => coin.update(dt));
    coins = coins.filter(coin => !coin.collected && coin.x + coin.size > -20);
    trees = trees.filter(tree => tree.x + 80 > -20);

    pipes.forEach(pipe => {
        pipe.draw();
        if (!pipe.passed && pipe.x + pipe.width < bird.x) {
            score += 1;
            pipe.passed = true;
            bestScore = Math.max(bestScore, score);
            updateHud();
            saveStoredStats();
        }

        if (pipe.collidesWith(bird)) {
            triggerFlash();
            endGame();
        }
    });

    coins.forEach(coin => {
        coin.draw();
        if (!coin.collected && coin.collidesWith(bird)) {
            coin.collected = true;
            coinCount += 1;
            updateHud();
            saveStoredStats();
        }
    });

    if (bird.y + game_config.birdRadius >= height - game_config.groundHeight) {
        bird.y = height - game_config.groundHeight - game_config.birdRadius;
        triggerFlash();
        endGame();
    }

    if (flashTimer > 0) {
        flashTimer -= 1;
        if (flashTimer <= 0) {
            hitFlash.classList.remove('active');
        }
    }

    if (running) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function jumpAction() {
    if (gameState === 'start') {
        initGame({ jumpImmediately: true });
        return;
    }
    if (gameState === 'over') return;
    if (bird) {
        bird.jump();
    }
}

window.addEventListener('keydown', event => {
    if (event.code === 'Space') {
        event.preventDefault();
        if (gameState === 'over') return;
        jumpAction();
    }
});

window.addEventListener('pointerdown', event => {
    if (event.target instanceof Element && event.target.closest('button')) {
        return;
    }
    if (gameState === 'over') return;
    jumpAction();
});

startButton.addEventListener('click', () => initGame({ jumpImmediately: true }));
retryButton.addEventListener('click', () => initGame({ jumpImmediately: true }));
window.addEventListener('resize', resizeCanvas);
loadStoredStats();
updateHud();
resizeCanvas();