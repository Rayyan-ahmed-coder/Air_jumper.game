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

const game_config = {
    gravity: 0.42,
    jumpStrength: -8.6,
    pipeGap: 188,
    pipeSpawnRate: 88,
    groundHeight: 64,
    birdRadius: 16,
    pipeSpeed: 3.65,
    coinSpawnRate: 110,
    treeSpawnRate: 6,
    treeSpeed: 2.6,
    difficultyRamp: 0.0016
};

const PIE_2 = Math.PI * 2;
const width = canvas.width;
const height = canvas.height;

let bird;
let pipes;
let clouds;
let stars;
let trees;
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
let flashTimer = 0;
let lastFrameTime = 0;
let animationFrameId = null;

class Bird {
    constructor() {
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

        const gradient = ctx.createRadialGradient(-4, -4, 4, 0, 0, game_config.birdRadius * 1.5);
        gradient.addColorStop(0, '#fff7b8');
        gradient.addColorStop(0.25, '#ffd166');
        gradient.addColorStop(1, '#f6ae2d');

        ctx.fillStyle = gradient;
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
        this.top = 60 + Math.random() * 250;
        this.bottom = this.top + game_config.pipeGap;
        this.passed = false;
        this.speed = game_config.pipeSpeed + Math.random() * 0.35 + Math.min(score / 200, 1.4) * 0.3;
    }

    update(dt) {
        this.x -= this.speed * (dt / 16.67);
    }

    draw() {
        ctx.save();
        const pipeX = this.x;
        const pipeW = this.width;
        const topH = this.top;
        const botY = this.bottom;
        const botH = height - botY;

        const colors = [
            '#1c9c34',
            '#28eb59',
            '#74f193',
            '#18ca45',
            '#0f7d2a'
        ];

        const pipeGradient = ctx.createLinearGradient(pipeX, 0, pipeX + pipeW, 0);
        pipeGradient.addColorStop(0.0, colors[0]);
        pipeGradient.addColorStop(0.15, colors[1]);
        pipeGradient.addColorStop(0.4, colors[2]);
        pipeGradient.addColorStop(0.7, colors[3]);
        pipeGradient.addColorStop(1.0, colors[4]);

        ctx.fillStyle = pipeGradient;
        ctx.shadowColor = 'rgba(69, 118, 255, 0.51)';
        ctx.shadowBlur = 20;
        ctx.fillRect(pipeX, 0, pipeW, topH);
        ctx.fillRect(pipeX, botY, pipeW, botH);
        ctx.shadowBlur = 0;

        const capH = 24;
        const capO = 4;
        const capX = pipeX - capO;
        const capW = pipeW + (capO * 2);

        const capGradient = ctx.createLinearGradient(capX, 0, capX + capW, 0);
        capGradient.addColorStop(0.0, colors[0]);
        capGradient.addColorStop(0.15, colors[1]);
        capGradient.addColorStop(0.4, colors[2]);
        capGradient.addColorStop(0.7, colors[3]);
        capGradient.addColorStop(1.0, colors[4]);
        ctx.fillStyle = capGradient;

        ctx.fillRect(capX, topH - capH, capW, capH);
        ctx.fillRect(capX, botY, capW, capH);
        ctx.fillStyle = '#112b41';
        ctx.fillRect(capX, topH - 4, capW, 4);
        ctx.fillRect(capX, botY, capW, 4);

        ctx.strokeStyle = '#0a1d2d';
        ctx.lineWidth = 2;

        ctx.strokeRect(pipeX, 0, pipeW, topH - capH);
        ctx.strokeRect(capX, topH - capH, capW, capH);
        ctx.strokeRect(capX, botY, capW, capH);
        ctx.strokeRect(pipeX, botY + capH, pipeW, botH - capH);
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
        this.size = 18;
        this.collected = false;
    }

    update(dt) {
        this.x -= (game_config.pipeSpeed + 0.7) * (dt / 16.67);
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
        const b = bird.getBounds();
        return b.right > this.x - this.size && b.left < this.x + this.size && b.bottom > this.y - this.size && b.top < this.y + this.size;
    }
}

class Tree {
    constructor() {
        this.scale = 0.7 + Math.random() * 0.7;
        this.y = height - game_config.groundHeight - 2;
        this.x = width + 40;
        this.speed = game_config.treeSpeed + Math.random() * 0.5;
        this.swing = Math.random() * 0.03;
        this.phase = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.x -= this.speed * (dt / 16.67);
        this.phase += 0.03 * (dt / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        const sway = Math.sin(this.phase) * this.swing;
        ctx.rotate(sway);

        ctx.fillStyle = '#774925';
        ctx.fillRect(-6, -25, 12, 25);

        ctx.fillStyle = '#1b4d3e';
         // Bottom layer
        ctx.beginPath();
        ctx.moveTo(-35, -20);
        ctx.lineTo(35, -20);
        ctx.lineTo(0, -55);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1c7038';
        // Middle layer
        ctx.beginPath();
        ctx.moveTo(-28, -45);
        ctx.lineTo(28, -45);
        ctx.lineTo(0, -75);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#19863d';
        // Top layer
        ctx.beginPath();
        ctx.moveTo(-20, -65);
        ctx.lineTo(20, -65);
        ctx.lineTo(0, -95);
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
        this.scale = 0.6 + Math.random() * 0.8;
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
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

function initGame() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    bird = new Bird();
    pipes = [];
    clouds = Array.from({ length: 6 }, () => new Cloud());
    stars = Array.from({ length: 70 }, () => new Star());
    trees = [];
    coins = [];
    frameCount = 0;
    score = 0;
    coinCount = 0;
    lastPipeTime = 0;
    lastCoinTime = 0;
    lastTreeTime = 0;
    flashTimer = 0;
    lastFrameTime = 0;
    running = true;
    gameState = 'running';
    scoreEl.textContent = score;
    if (coinScoreEl) {
        coinScoreEl.textContent = coinCount;
    }
    startOverlay.classList.remove('visible');
    gameOverOverlay.classList.remove('visible');
    animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
    running = false;
    gameState = 'over';
    bestScore = Math.max(bestScore, score);
    finalMessage.textContent = `Score: ${score} · Best: ${bestScore}`;
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
    trees.forEach(tree => tree.update(dt));
    trees.forEach(tree => tree.draw());

    bird.update(dt);
    drawParticles();
    bird.draw();
    drawGround();

    if (frameCount - lastPipeTime > game_config.pipeSpawnRate - Math.min(score * game_config.difficultyRamp, 18)) {
        pipes.push(new Pipe());
        lastPipeTime = frameCount;
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
    trees.forEach(tree => tree.update(dt));

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

    coins.forEach(coin => {
        coin.draw();
        if (!coin.collected && coin.collidesWith(bird)) {
            coin.collected = true;
            coinCount += 1;
            if (coinScoreEl) {
                coinScoreEl.textContent = coinCount;
            }
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