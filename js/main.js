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
    pipeSpawnRate: 105,
    coinSpawnRate: 110,
    treeSpawnRate: 20,
    pipeSpeed: 3.65,
    treeSpeed: 3.7,
    difficultyRamp: 0.2,
    maxParticles: 12,
    maxClouds: 6,
    maxStars: 70,
    maxPipes: 12,
    maxTrees: 15,
    maxCoins: 20,
};

const PIE_2 = Math.PI * 2;
const BASE_WIDTH = 820;
const BASE_HEIGHT = 620;
const STORAGE_KEY = 'air-jumper-stats';
const colors = [
    '#1c9c34', 
    '#28eb59', 
    '#74f193', 
    '#1bd148', 
    '#0f7d2a'
];
let width = BASE_WIDTH;
let height = BASE_HEIGHT;
let dpr = Math.min(window.devicePixelRatio || 1, 2);

let bird;
let pipes;
let clouds;
let stars;
let nightStars; // Extra stars for spectacular night
let trees;
let bushes;
let coins;
let powerUps;
let frameCount;
let score;
let coinCount = 0;
let bestScore = 0;
let topScores = [];
let running = false;
let gameState = 'start';
let lastPipeTime = 0;
let lastCoinTime = 0;
let lastTreeTime = 0;
let lastBushTime = 0;
let lastPowerUpTime = 0;
let shieldActive = false;
let flashTimer = 0;
let lastFrameTime = 0;
let animationFrameId = null;

const powerUpsState = {
    shield: false,
    magnet: false,
    doubleScore: false,
    tinyBird: false,
    slowMotion: false,
    dash: false,
    phoenix: false
};

const powerUpTimers = {
    magnet: 0,
    doubleScore: 0,
    tinyBird: 0,
    slowMotion: 0,
    dash: 0
};


let mountainOffset1 = 0;
let mountainOffset2 = 0;
let mountainOffset3 = 0;

let birdScale = 1;
let gameSpeedMultiplier = 1;
let dashTrail = [];

// Object pools for performance
const pipePool = [];
const coinPool = [];
const bushPool = [];
const powerUpPool = [];

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
        if (Array.isArray(parsed?.topScores)) {
            topScores = parsed.topScores.slice(0, 10);
        }
    } catch (error) {
        console.warn('Unable to load saved stats', error);
    }
}

function saveStoredStats() {
    try {
        // Add current score to topScores if it's high enough
        if (score > 0) {
            topScores.push(score);
            topScores.sort((a, b) => b - a);
            topScores = topScores.slice(0, 10);
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
            bestScore, 
            coinCount,
            topScores
        }));
    } catch (error) {
        console.warn('Unable to save stats', error);
    }
}

function hitPlayer() {
    if (powerUpsState.dash) {
        return;
    }
    if (powerUpsState.shield) {
        powerUpsState.shield = false;
        triggerFlash();
        return;
    }

    if (powerUpsState.phoenix) {
        revivePlayer();
        return;
    }
    triggerFlash();
    endGame();
}

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
        if (powerUpsState.dash) gameSpeedMultiplier = 3;
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
        const r = game_config.birdRadius * birdScale;
        return {
            left: this.x - r,
            right: this.x + r,
            top: this.y - r,
            bottom: this.y + r
        };
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(birdScale, birdScale);
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
        this.top = 65 + Math.random() * 250;
        this.bottom = this.top + game_config.pipeGap;
        this.passed = false;
        this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5;
        this.topHeight = this.top;
        this.bottomY = this.bottom;
        this.bottomHeight = height - this.bottomY;
        this.capHeight = 24;
        this.capOffset = 4;
    }

    update(dt) {
        this.x -= this.speed * gameSpeedMultiplier * (dt / 16.67);
    }

    draw() {
        ctx.save();

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
        this.angle = 0; // Renamed from scaleX for semantic clarity
        this.size = 20;
        this.collected = false;
    }

    update(dt) {
        const deltaTime = dt || 16.67;   
        const speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.4) * 0.3;
        this.x -= this.speed * gameSpeedMultiplier * (deltaTime / 16.67);
        this.angle += 0.05 * (deltaTime / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        const currentScaleX = Math.abs(Math.cos(this.angle));
        ctx.scale(currentScaleX, 1);
        ctx.shadowColor = 'rgba(233, 200, 94, 0.81)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffd22e';
        ctx.beginPath();
        ctx.arc(0, 0, this.size / 2, 0, PIE_2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgb(255, 114, 32)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, (this.size / 2) + 2, 0, fullCircle);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    collidesWith(bird) {
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
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
        this.x -= this.speed * gameSpeedMultiplier * (dt / 16.67);
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

class Bush {
    constructor() {
        this.scale = 0.8 + Math.random() * 0.5;
        this.y = height - game_config.groundHeight + Math.random() * 19;
        this.x = width + 20;
        this.speed = game_config.treeSpeed + Math.min(score * game_config.difficultyRamp, 1.0);
        this.width = 40 * this.scale;
        this.height = 20 * this.scale;
    }

    update(dt) {
        this.x -= this.speed * gameSpeedMultiplier * (dt / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        
        ctx.fillStyle = '#2a6e3a';
        ctx.beginPath();
        ctx.moveTo(-20, -15);
        ctx.quadraticCurveTo(-10, -25, 0, -20);
        ctx.quadraticCurveTo(10, -25, 20, -15);
        ctx.lineTo(20, 5);
        ctx.lineTo(-20, 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#1e5a2f';
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.arc(-8, -8, 5, 0, Math.PI * 2);
        ctx.moveTo(0, -15);
        ctx.arc(4, -12, 6, 0, Math.PI * 2);
        ctx.moveTo(12, -10);
        ctx.arc(8, -8, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    collidesWith(bird) {
        const bx = this.x + this.width / 2;
        const by = this.y;
        const dx = bird.x - bx;
        const dy = bird.y - by;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < game_config.birdRadius + 20;
    }
}

class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 18;
        this.collected = false;
        this.rotation = Math.random() * Math.PI * 2;
        const types = [
            "shield",
            "magnet",
            "doubleScore",
            "tinyBird",
            "slowMotion",
            "dash",
            "phoenix"
        ];
        this.type = types[Math.floor(Math.random() * types.length)];
    }

    update(dt) {
        this.x -= (game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5) * gameSpeedMultiplier * (dt / 16.67);
        this.rotation += 0.08;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x,this.y);
        this.rotation += .03;
        ctx.rotate(this.rotation);
        const colors = {
            shield:"#ff5ca8",
            magnet:"#ff4040",
            doubleScore:"#ffd93d",
            tinyBird:"#55ff99",
            slowMotion:"#5ac8ff",
            dash:"#8d5cff",
            phoenix:"#ff7b00"
        };
        ctx.shadowColor = colors[this.type];
        ctx.shadowBlur = 18;
        ctx.fillStyle = colors[this.type];
        ctx.beginPath();
        ctx.arc(0,0,this.size,0,Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle="white";
        ctx.font="bold 18px Arial";
        ctx.textAlign="center";
        ctx.textBaseline="middle";
        const icons={
            shield:"🛡",
            magnet:"🧲",
            doubleScore:"×2",
            tinyBird:"⬇",
            slowMotion:"❄",
            dash:"⚡",
            phoenix:"🔥"
        };
        ctx.fillText(icons[this.type],0,1);
        ctx.restore();
    }

    collidesWith(bird) {
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < game_config.birdRadius + this.size;
    }
}

class Cloud {
    constructor() {
        this.g = ctx.createRadialGradient(0, 0, 5, 0, 0, 60);
        this.g.addColorStop(0,"rgba(255,255,255,.95)");
        this.g.addColorStop(.7,"rgba(255, 255, 255, 0.77)");
        this.g.addColorStop(1,"rgba(255, 255, 255, 0.69)");

        this.reset();
    }

    reset() {
        this.x = width + Math.random() * 220;
        this.y = 30 + Math.random() * (height * 0.3);
        this.scale = 0.85 + Math.random() * 0.7;
        this.speed = 0.15 + Math.random() * 0.4;
    }

    update(dt) {
        this.x -= this.speed * gameSpeedMultiplier * (dt / 16.67);
        if (this.x + 20 * this.scale < -20) {
            this.reset();
        }
    }

    draw(){
        ctx.save();
        ctx.translate(this.x,this.y);
        ctx.scale(this.scale,this.scale);
        const g=ctx.createRadialGradient(25, 10, 5, 25, 10, 70);
        g.addColorStop(0,"rgba(255,255,255,.95)");
        g.addColorStop(.65,"rgba(255,255,255,.72)");
        g.addColorStop(1,"rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0,8,24,0,PIE_2);
        ctx.arc(20,-6,26,0,PIE_2);
        ctx.arc(46,-4,24,0,PIE_2);
        ctx.arc(70,8,26,0,PIE_2);
        ctx.arc(35,18,28,0,PIE_2);
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
        this.alpha = 0.35 + Math.random() * 0.6 ;
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
    powerUps = [];
    frameCount = 0;
    score = 0;
    flashTimer = 0;
    lastFrameTime = 0;
    lastPipeTime = 0;
    lastCoinTime = 0;
    lastTreeTime = 0;
    lastBushTime = 0;
    lastPowerUpTime = 0;
    shootingStarTimer = 0;
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
    
    const isNewBest = score === bestScore;
    const topScoresText = topScores.slice(0, 3).map((s, i) => `${i+1}. ${s}`).join(' · ');
    const bestLabel = isNewBest ? '🏆 NEW BEST!' : `Best: ${bestScore}`;
    
    finalMessage.textContent = `Score: ${score} · ${bestLabel} · Coins: ${coinCount} ${topScoresText ? '| Top: ' + topScoresText : ''}`;
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

function lerpColor(color1, color2, t) {
    // Simple linear interpolation between two hex colors
    const c1 = parseInt(color1.slice(1), 16);
    const c2 = parseInt(color2.slice(1), 16);
    
    const r1 = (c1 >> 16) & 255;
    const g1 = (c1 >> 8) & 255;
    const b1 = c1 & 255;
    
    const r2 = (c2 >> 16) & 255;
    const g2 = (c2 >> 8) & 255;
    const b2 = c2 & 255;
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    return `rgb(${r}, ${g}, ${b})`;
}

function drawFloatingIsland(x, y, scale){
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(scale,scale);
    // grass
    ctx.fillStyle="#42d95b";
    ctx.beginPath()
    ctx.moveTo(-60,0)
    ctx.quadraticCurveTo(0,-18,60,0);
    ctx.lineTo(45,18);
    ctx.lineTo(-45,18);
    ctx.closePath();
    ctx.fill();
    // rock
    ctx.fillStyle="#5d6570";
    ctx.beginPath();
    ctx.moveTo(-45,18);
    ctx.lineTo(45,18);
    ctx.lineTo(20,65);
    ctx.lineTo(-15,70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawMountainLayer(color, heightOffset, peakHeight, widthSize, offset) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-widthSize + offset, height);
    for (let x = -widthSize; x < width + widthSize * 2; x += widthSize) {
        ctx.lineTo(
            x + offset,
            height - heightOffset
        );

        ctx.lineTo(
            x + widthSize * 0.5 + offset,
            height - heightOffset - peakHeight
        );

        ctx.lineTo(
            x + widthSize + offset,
            height - heightOffset
        );
    }

    ctx.lineTo(width + widthSize, height);
    ctx.closePath();
    ctx.fill();
}

function drawBackground() {
    // Main Gradient
    const offset = Math.sin(frameCount * 0.001) * 25;
    const sky = ctx.createLinearGradient(0, offset, 0, height);

    sky.addColorStop(0.00, "#4D6DFF");
    sky.addColorStop(0.18, "#4D95FF");
    sky.addColorStop(0.42, "#38C7FF");
    sky.addColorStop(0.70, "#4DEBFF");
    sky.addColorStop(1.00, "#77FFD8");

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    // Giant Background Color Blobs
    const blobs = [
        {
            x: width * .18,
            y: 140,
            r: 260,
            color: "rgba(255,255,255,.08)"
        },

        {
            x: width * .80,
            y: 180,
            r: 340,
            color: "rgba(0,255,255,.08)"
        },

        {
            x: width * .45,
            y: 60,
            r: 220,
            color: "rgba(120,100,255,.07)"
        }
    ];

    blobs.forEach(blob => {
        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
        gradient.addColorStop(0, blob.color);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
        ctx.fill();

    });

    // Floating Glow Circles
    for (let i = 0; i < 18; i++) {
        const x = (frameCount * .15 + i * 130) % (width + 100) - 50;
        const y = 70 + Math.sin(frameCount * .01 + i) * 35 + i * 10;
        ctx.fillStyle = "rgba(108, 189, 255, 0.09)";
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Atmospheric Waves
    for (let i = 0; i < 5; i++) {
        const alpha = 0.085 + i / 100;
        ctx.fillStyle = `rgba(78, 137, 165, ${String(alpha)})`;
        const y = 120 + i * 75 + Math.sin(frameCount * .006 + i) * 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(width * .2, y - 25, width * .4, y + 30, width * .6, y);
        ctx.bezierCurveTo(width * .8, y - 30, width, y + 20, width, y + 60);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

    }

    // Horizon Glow
    const horizon = ctx.createLinearGradient(0, height * .45, 0, height);
    horizon.addColorStop(0, "rgba(255,255,255,0)");
    horizon.addColorStop(.5, "rgba(255,255,255,.05)");
    horizon.addColorStop(1, "rgba(180,255,255,.15)");
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 0, width, height);

    // Sparkles
    for (let i = 0; i < 90; i++) {
        const x = (i * 91) % width;
        const y = (i * 37) % 330;
        const pulse = .25 + .75 * Math.sin(frameCount * .02 + i);
        ctx.fillStyle = `rgba(255,255,255,${0.15 * pulse})`;
        ctx.fillRect(x, y, 2, 2);
    }
    drawFloatingIsland(width * .28 + Math.sin(frameCount * .004) * 25, 170, 0.9);
    drawFloatingIsland(width * .72 + Math.sin(frameCount * .005 + 2) * 18, 130, .7);
    mountainOffset1 -= 0.15;
    mountainOffset2 -= 0.35;
    mountainOffset3 -= 0.7;

    if (mountainOffset1 <= -420)
        mountainOffset1 = 0;
    if (mountainOffset2 <= -360)
        mountainOffset2 = 0;
    if (mountainOffset3 <= -300)
        mountainOffset3 = 0;
    drawMountainLayer("#2d5da8", 270, 90, 420, mountainOffset1);
    drawMountainLayer("#4474bf", 220, 130, 360, mountainOffset2);
    drawMountainLayer("#6fa2ea", 170, 110, 300, mountainOffset3);
    for (let i = 0; i < 25; i++) {
        const speed = 1 + Math.sin(i * 17.3) * 0.4 + 1.5;
        const length = 60 + (Math.sin(i * 9.7) + 1) * 50;
        // Move RIGHT ➜ LEFT
        const x = width + length - ((frameCount * speed + i * 145) % (width + length * 2))
        const y = 40 + i * 22 + Math.sin(frameCount * 0.015 + i * 0.8) * 12;
        const curve = Math.sin(frameCount * 0.02 + i) * 8;
        const gradient = ctx.createLinearGradient(x, y, x - length, y);

        gradient.addColorStop(0, `rgba(255, 255, 255, 0.13)`);
        gradient.addColorStop(0.25, `rgba(255, 255, 255, 0.27)`);
        gradient.addColorStop(0.75, `rgba(255, 255, 255, 0.45)`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0.51)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1 + (i % 3);
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(x, y);

        ctx.bezierCurveTo(
            x - length * 0.3, y + curve,
            x - length * 0.7, y - curve,
            x - length, y
        );

        ctx.stroke();
    }
    stars.forEach(star => {
        star.draw();
    });

    clouds.forEach(cloud => {
        cloud.draw();
    });
}

function drawPowerUps() {
    ctx.save();
    ctx.font = "20px Arial";
    ctx.textAlign = "left";
    let y = 35;
    const icons = {
        shield: "🛡",
        magnet: "🧲",
        doubleScore: "⭐",
        tinyBird: "🐦",
        slowMotion: "❄",
        dash: "⚡",
        phoenix: "🔥"
    };
    for(const key in powerUpsState) {
        if (powerUpsState[key]) {
            let text = icons[key];
            if (powerUpTimers[key]) {
                text += " "+ Math.ceil(powerUpTimers[key] / 60);
            }
            ctx.fillStyle = "white";
            ctx.fillText(text, 20, y);
            y += 28;
        }
    }
    ctx.restore();
}

function drawGround(){
    const g=ctx.createLinearGradient(0, height-game_config.groundHeight, 0, height);
    g.addColorStop(0, "#69d63d");
    g.addColorStop(.5, "#46b02d");
    g.addColorStop(1, "#2d7e21");
    ctx.fillStyle = g;
    ctx.fillRect(0, height - game_config.groundHeight, width, game_config.groundHeight);
    // grass
    ctx.fillStyle="#8cff61";
    ctx.fillRect(0, height - game_config.groundHeight, width, 6);
    // dirt dots
    for(let i = 0; i < width; i += 20){
        ctx.fillStyle = "rgba(0,0,0,.12)";
        ctx.beginPath();
        ctx.arc(i, height - 20 + Math.sin(i) * 2, 2, 0, PIE_2); 
        ctx.fill();
    }
}

function drawDashTrail() {
    dashTrail.forEach(p => {
        p.life--;
        p.size *= .97;
        ctx.globalAlpha = p.life / 30;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, PIE_2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    dashTrail = dashTrail.filter(p => p.life > 0);
}

function spawnDashParticle(){
    dashTrail.push({
        x: bird.x, 
        y: bird.y,
        size: 10,
        life: 30,
        color: `hsl(${frameCount*8},100%,65%)`
    });
}

function activatePowerUp(type){
    switch(type) {
        case "shield":
            powerUpsState.shield = true;
            break;
        case "magnet":
            powerUpsState.magnet = true;
            powerUpTimers.magnet = 10 * 60;
            break;
        case "doubleScore":
            powerUpsState.doubleScore = true;
            powerUpTimers.doubleScore = 10 * 60;
            break;
        case "tinyBird":
            powerUpsState.tinyBird = true;
            powerUpTimers.tinyBird = 10 * 60;
            birdScale = .55;
            break;
        case "slowMotion":
            powerUpsState.slowMotion = true;
            powerUpTimers.slowMotion = 12 * 60;
            gameSpeedMultiplier = .65;
            break;
        case "dash":
            powerUpsState.dash = true;
            powerUpTimers.dash = 4 * 60;
            break;
        case "phoenix": 
            powerUpsState.phoenix = true; 
            break;
    }
}

function updatePowerUps(){
    Object.keys(powerUpTimers).forEach(key => {
        if(powerUpTimers[key] > 0) {
            powerUpTimers[key]--;
            if(powerUpTimers[key] == 0){
                powerUpsState[key] = false;
            }
        }
    });

    if(!powerUpsState.tinyBird){
        birdScale = 1;
    }

    if(!powerUpsState.slowMotion) {
        gameSpeedMultiplier = 1;
    }

    if(!powerUpsState.dash){
        bird.x = width * .22;
    }
}

function revivePlayer(){
    powerUpsState.phoenix = false;
    bird.y = height / 2;
    bird.velocity = 0;
    bird.jump();
    bird.x = width * .22;
    pipes = pipes.filter(pipe => pipe.x > bird.x + 180);
    bushes = bushes.filter(bush => bush.x > bird.x + 180);
    coins = coins.filter(coin => coin.x > bird.x + 120);
    powerUps = powerUps.filter(p => p.x > bird.x + 120);
}

function gameLoop(timestamp) {
    if (!running) return;

    if (!lastFrameTime) {
        lastFrameTime = timestamp;
    }

    const dt = Math.min(timestamp - lastFrameTime, 32);
    lastFrameTime = timestamp;
    frameCount += 1;
    updatePowerUps();

    ctx.clearRect(0, 0, width, height);
    drawBackground();
    stars.forEach(star => star.update());
    clouds.forEach(cloud => cloud.update(dt));
    drawGround();
    drawPowerUps();
    trees.forEach(tree => tree.update(dt));
    trees.forEach(tree => tree.draw());
    bushes.forEach(bush => bush.update(dt));
    bushes.forEach(bush => bush.draw());
    drawDashTrail();
    bird.update(dt);
    bird.draw();

    if (frameCount - lastPipeTime > game_config.pipeSpawnRate - Math.min(score * game_config.difficultyRamp, 18)) {
        pipes.push(new Pipe());
        lastPipeTime = frameCount;
    }

    if (pipes.length > game_config.maxPipes) {
        pipes.splice(0, pipes.length - game_config.maxPipes);
    }
    if (frameCount - lastTreeTime > game_config.treeSpawnRate - Math.min(score * game_config.difficultyRamp, 16) * 0.25) {
        trees.push(new Tree());
        lastTreeTime = frameCount;
    }
    if (frameCount - lastBushTime > game_config.treeSpawnRate + 26 - Math.min(score * game_config.difficultyRamp, 14)) {
        bushes.push(new Bush());
        lastBushTime = frameCount;
    }
    if (frameCount - lastCoinTime > game_config.coinSpawnRate) {
        const minY = 100;
        const maxY = height - game_config.groundHeight - 100;
        coins.push(new Coin(width + 40, minY + Math.random() * (maxY - minY)));
        lastCoinTime = frameCount;
    }
    
    // Spawn power-ups occasionally
    if (frameCount - lastPowerUpTime > game_config.coinSpawnRate * 2.5 && Math.random() > 0.6) {
        const minY = 100;
        const maxY = height - game_config.groundHeight - 100;
        const type = Math.random() > 0.5 ? 'shield' : 'speedBoost';
        powerUps.push(new PowerUp(width + 40, minY + Math.random() * (maxY - minY), type));
        lastPowerUpTime = frameCount;
    }

    if(powerUpsState.dash) {
        spawnDashParticle();
    }


    pipes.forEach(pipe => pipe.update(dt));
    pipes = pipes.filter(pipe => pipe.x + pipe.width > -20);
    coins.forEach(coin=> {
        coin.update(dt);
        if(powerUpsState.magnet){
            const dx = bird.x - coin.x;
            const dy = bird.y - coin.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist < 170) {
                coin.x += dx * .08;
                coin.y += dy * .08;
            }
        }});
    coins = coins.filter(coin => !coin.collected && coin.x + coin.size > -20);
    bushes = bushes.filter(bush => bush.x + bush.width > -20);
    powerUps.forEach(pu => pu.update(dt));
    powerUps = powerUps.filter(pu => !pu.collected && pu.x + pu.size > -20);
    trees = trees.filter(tree => tree.x + 80 > -20);

    pipes.forEach(pipe => {
        pipe.draw();
        if (!pipe.passed && pipe.x + pipe.width < bird.x) {
            score += powerUpsState.doubleScore? 2 : 1;
            pipe.passed = true;
            bestScore = Math.max(bestScore, score);
            updateHud();
            saveStoredStats();
        }

        if (pipe.collidesWith(bird)) {
            hitPlayer();
        }
    });

    bushes.forEach(bush => {
        if (bush.collidesWith(bird)) {
            bird.jump();
            triggerFlash();
            score = Math.max(0, score - 1);
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

    powerUps.forEach(pu => {
        pu.draw();
        if(!pu.collected && pu.collidesWith(bird)){
            pu.collected = true;
            activatePowerUp(pu.type);
            updateHud();
        }
    });

    if (bird.y + game_config.birdRadius >= height - game_config.groundHeight) {
        hitPlayer();
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