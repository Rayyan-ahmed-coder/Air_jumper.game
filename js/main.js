const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const startButton = document.getElementById('startButton');
const retryButton = document.getElementById('retryButton');
const finalMessage = document.getElementById('finalMessage');
const hitFlash = document.getElementById('hitFlash');

const width = canvas.width;
const height = canvas.height;
const groundHeight = 64;
const gravity = 0.42;
const jumpStrength = -8.8;

let bird;
let pipes;
let frameCount;
let score;
let bestScore = 0;
let running = false;
let gameState = 'start';
let lastPipeTime;
let flashTimer = 0;

class Bird {
    constructor() {
    this.x = width * 0.22;
    this.y = height / 2;
    this.radius = 16;
    this.velocity = 0;
    this.rotation = 0;
    }

    update() {
    this.velocity += gravity;
    this.y += this.velocity;
    this.rotation = Math.min(Math.max(this.velocity / 16, -0.7), 1.0);
    if (this.y < this.radius) {
        this.y = this.radius;
        this.velocity = 0;
    }
    }

    jump() {
    this.velocity = jumpStrength;
    }

    getBounds() {
    return {
        left: this.x - this.radius,
        right: this.x + this.radius,
        top: this.y - this.radius,
        bottom: this.y + this.radius,
    };
    }

    draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    const gradient = ctx.createRadialGradient(-4, -4, 4, 0, 0, this.radius * 1.5);
    gradient.addColorStop(0, '#fff7b8');
    gradient.addColorStop(0.25, '#ffd166');
    gradient.addColorStop(1, '#f6ae2d');

    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#162a44';
    ctx.beginPath();
    ctx.arc(6, -2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2c3f59';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 2, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    }
}

class Pipe {
    constructor() {
    this.width = 72;
    this.gap = 170;
    this.x = width + this.width;
    this.top = 80 + Math.random() * 200;
    this.bottom = this.top + this.gap;
    this.passed = false;
    this.speed = 2.8 + frameCount * 0.0006;
    }

    update() {
    this.x -= this.speed;
    }

    draw() {
    const pipeGradient = ctx.createLinearGradient(this.x, 0, this.x + this.width, 0);
    pipeGradient.addColorStop(0, '#30c5ff');
    pipeGradient.addColorStop(1, '#1f7fb7');

    ctx.fillStyle = pipeGradient;
    ctx.shadowColor = 'rgba(48, 197, 255, 0.35)';
    ctx.shadowBlur = 20;

    ctx.fillRect(this.x, 0, this.width, this.top);
    ctx.fillRect(this.x, this.bottom, this.width, height - this.bottom);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b1d2c';
    ctx.fillRect(this.x + 8, this.top - 14, this.width - 16, 14);
    ctx.fillRect(this.x + 8, this.bottom, this.width - 16, 14);
    }

    collidesWith(bird) {
    const b = bird.getBounds();
    const hitX = b.right > this.x && b.left < this.x + this.width;
    const hitTop = b.top < this.top;
    const hitBottom = b.bottom > this.bottom;
    return hitX && (hitTop || hitBottom);
    }
}

function initGame() {
    bird = new Bird();
    pipes = [];
    frameCount = 0;
    score = 0;
    lastPipeTime = 0;
    running = true;
    gameState = 'running';
    scoreEl.textContent = score;
    startOverlay.classList.remove('visible');
    gameOverOverlay.classList.remove('visible');
    requestAnimationFrame(gameLoop);
}

function endGame() {
    running = false;
    gameState = 'over';
    bestScore = Math.max(bestScore, score);
    finalMessage.textContent = `Score: ${score} · Best: ${bestScore}`;
    gameOverOverlay.classList.add('visible');
}

function triggerFlash() {
    flashTimer = 4;
    hitFlash.classList.add('active');
}

function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#10254b');
    sky.addColorStop(0.55, '#0b1f3a');
    sky.addColorStop(1, '#051124');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 120; i += 30) {
    ctx.fillStyle = `rgba(255,255,255, ${0.06 + 0.02 * Math.sin((frameCount + i) * 0.03)})`;
    ctx.fillRect((i * 13) % width, height - groundHeight - 10 - ((i * 7) % 24), 6, 6);
    }

    ctx.fillStyle = '#0c1731';
    ctx.fillRect(0, height - groundHeight, width, groundHeight);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, height - groundHeight, width, 4);
}

function drawParticles() {
    const count = 12;
    for (let i = 0; i < count; i++) {
    const offset = Math.sin((frameCount + i * 18) * 0.07) * 4;
    ctx.fillStyle = `rgba(255, 217, 104, ${0.08 + 0.04 * Math.sin((frameCount + i) * 0.33)})`;
    ctx.beginPath();
    ctx.arc(bird.x - 16 - i * 3 + offset, bird.y + 6 + (i % 3) * 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
    }
}

function gameLoop() {
    if (!running) return;
    frameCount++;
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    bird.update();
    drawParticles();
    bird.draw();

    if (frameCount - lastPipeTime > 110) {
    pipes.push(new Pipe());
    lastPipeTime = frameCount;
    }

    pipes.forEach(pipe => pipe.update());
    pipes = pipes.filter(pipe => pipe.x + pipe.width > -20);

    pipes.forEach(pipe => {
    pipe.draw();
    if (!pipe.passed && pipe.x + pipe.width < bird.x) {
        score += 1;
        pipe.passed = true;
        scoreEl.textContent = score;
    }

    if (pipe.collidesWith(bird)) {
        triggerFlash();
        endGame();
    }
    });

    if (bird.y + bird.radius >= height - groundHeight) {
    bird.y = height - groundHeight - bird.radius;
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
    requestAnimationFrame(gameLoop);
    }
}

function jumpAction() {
    if (gameState === 'start') {
    initGame();
    }
    if (gameState === 'over') return;
    bird.jump();
}

window.addEventListener('keydown', event => {
    if (event.code === 'Space') {
    event.preventDefault();
    if (gameState === 'over') return;
    jumpAction();
    }
});

window.addEventListener('pointerdown', () => {
    if (gameState === 'over') return;
    jumpAction();
});

startButton.addEventListener('click', initGame);
retryButton.addEventListener('click', initGame);