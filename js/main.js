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
let canvasWidth = BASE_WIDTH;
let canvasHeight = BASE_HEIGHT;
let devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

let bird;

let pipes;
let clouds;
let stars;
let trees;
let bushes;
let coins;
let particles;
let powerUps;

let frameCount;
let score;
let coinCount = 0;
let bestScore = 0;

let lastPipeTime = 0;
let lastCoinTime = 0;
let lastTreeTime = 0;
let lastBushTime = 0;
let lastPowerUpTime = 0;

let flashTimer = 0;
let lastFrameTime = 0;
let animationFrameId = null;

const DAY_LENGTH = 50000; // Game time in ms
let worldTime = DAY_LENGTH * 0.1;
let skyBrightness = 1;

const Game_State = {
    start: "start",
    running: "running",
    paused: "paused", // Will be added later
    game_over: "over"
};

const Spawn_Rates = {
    pipeSpawnRate: 80,
    coinSpawnRate: 90,
    treeSpawnRate: 20
}

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

let gameState = Game_State.start;

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
    } catch (error) {
        console.warn('Unable to load saved stats', error);
    }
}

function saveStoredStats() {
    try {        
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
            bestScore, 
            coinCount
        }));
    } catch (error) {
        console.warn('Unable to save stats', error);
    }
}

function hitPlayer() {
    if (powerUpsState.dash) {
        if (bird.y + game_config.birdRadius >= canvasHeight - game_config.groundHeight) {
            bird.jump();
        }
        return;
    }
    if (powerUpsState.shield) {
        triggerFlash();
        setTimeout(() => {
            powerUpsState.shield = false;
        }, 1500);
        return;
    }

    if (powerUpsState.phoenix) {
        revivePlayer();
        return;
    }

    gameState = Game_State.game_over;
    triggerFlash();
    endGame();
}

function resizeCanvas() {
    const maxWidth = Math.min(window.innerWidth - 24, BASE_WIDTH);
    const maxHeight = Math.min(window.innerHeight - 24, BASE_HEIGHT);
    const scale = Math.min(maxWidth / BASE_WIDTH, maxHeight / BASE_HEIGHT, 1);

    canvas.style.width = `${Math.round(BASE_WIDTH * scale)}px`;
    canvas.style.height = `${Math.round(BASE_HEIGHT * scale)}px`;

    devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(BASE_WIDTH * devicePixelRatio);
    canvas.height = Math.round(BASE_HEIGHT * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = true;

    canvasWidth = BASE_WIDTH;
    canvasHeight = BASE_HEIGHT;

    if (gameState === Game_State.running) {
        initGame();
    } else if (bird) {
        bird.x = canvasWidth * 0.22;
        bird.y = canvasHeight / 2;
    }
}

function screenShake(integer) {
    try {
        ctx.save();
        if(integer > 0 && typeof integer === "number") {
            ctx.translate(
                (Math.random() - .5) * integer,
                (Math.random() - .5) * integer
            );
            integer *= .9;
            if (integer < .1) integer = 0;
        } else {
            console.error(`Wrong screen shake value: `, integer);
        }
    } catch (error) {
        console.error('Error occured in screenShake() function');
    } finally {
        ctx.restore();
    }
}


function triggerFlash() {
    flashTimer = 5;
    hitFlash.classList.add('active');
}

class Bird {
    constructor() {
        this.x = canvasWidth * 0.22;
        this.y = canvasHeight / 2;
        this.velocity = 0;
        this.rotation = 0;
    }

    update(dt) {
        const frameScale = dt / 16.67;
        this.velocity += game_config.gravity * frameScale;
        this.y += this.velocity * frameScale;
        this.rotation += (Math.min(Math.max(this.velocity / 16, -0.7), 1) - this.rotation) * 0.2;

        if (this.y < game_config.birdRadius) {
            this.y = game_config.birdRadius;
            this.velocity = 0;
        }

        if(this.y + game_config.birdRadius >= canvasHeight - game_config.groundHeight){
            this.y = canvasHeight - game_config.groundHeight - game_config.birdRadius;
            hitPlayer();
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

        const flap = Math.sin(frameCount * .45) * 12;
        ctx.fillStyle="#ffd94d";
        ctx.beginPath();
        ctx.ellipse(-10, flap, 10, 5, -.5, 0, PIE_2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(10, flap, 10, 5, .5, 0, PIE_2);
        ctx.fill();

        ctx.fillStyle = '#162a44';
        ctx.beginPath();
        ctx.arc(6, -2, 4.5, 0, PIE_2);
        ctx.fill();

        ctx.strokeStyle = '#1a49a1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 2, game_config.birdRadius + 2, 0, PIE_2);
        ctx.stroke();
        this.birdPowerUps();
        ctx.restore();
    }

    birdPowerUps() {
        if(powerUpsState.shield) {
            const pulse = Math.sin(frameCount * 0.1) * 2;
            const bubbleRadius = game_config.birdRadius * 2 + pulse;

            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(135, 206, 250, 0.75)'; // Translucent light blue
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRadius, 0, PIE_2);
            ctx.fill();

            ctx.strokeStyle = '#3498db'; // Bright blue border
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRadius, 0, PIE_2);
            ctx.stroke();
        }

        if (powerUpsState.magnet) {
            ctx.strokeStyle="rgba(255,80,80,.35)";
            ctx.beginPath();
            ctx.arc(0, 0, 170, 0, PIE_2);
            ctx.stroke();
        }
    }
}

class Pipe {
    constructor() {
        this.width = 78;
        this.x = canvasWidth + this.width;
        this.top = 65 + Math.random() * 250;
        this.bottom = this.top + game_config.pipeGap;
        this.passed = false;
        this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5;
        this.topHeight = this.top;
        this.bottomY = this.bottom;
        this.bottomHeight = canvasHeight - this.bottomY;
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
        this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.4) * 0.3;
        this.collected = false;
    }

    update(dt) {
        const deltaTime = dt || 16.67;
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
        ctx.arc(0, 0, (this.size / 2) + 2, 0, PIE_2);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    collidesWith(bird) {
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        const max = game_config.birdRadius + this.size / 2;
        return dx * dx + dy * dy < max * max;
    }
}

class PowerUp {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 18;
        this.collected = false;
        this.rotation = 0;
        this.pulse = 0;
        
        // Configuration for colors, symbols, and distinct design rules
        this.powerUpMeta = {
            shield:       { color: "#ff5ca8", bg: "#4a1230", icon: "🛡️", isEmoji: true },
            magnet:       { color: "#ff4040", bg: "#4a1010", icon: "🧲", isEmoji: true },
            doubleScore:  { color: "#ffd93d", bg: "#4a3b0a", icon: "×2", isEmoji: false },
            tinyBird:     { color: "#55ff99", bg: "#0f4a27", icon: "⬇", isEmoji: false },
            slowMotion:   { color: "#5ac8ff", bg: "#0f364a", icon: "❄️", isEmoji: true },
            dash:         { color: "#8d5cff", bg: "#250f4a", icon: "⚡", isEmoji: true },
            phoenix:      { color: "#ff7b00", bg: "#4a220f", icon: "🔥", isEmoji: true }
        };

        const types = Object.keys(this.powerUpMeta);
        this.type = types[Math.floor(Math.random() * types.length)];
    }

    update(dt) {
        const speed = (game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5) * gameSpeedMultiplier;
        this.x -= speed * (dt / 16.67);
        
        // Time-independent smooth rotations and floating animations
        const timeFactor = dt / 16.67;
        this.rotation += 0.04 * timeFactor;
        this.pulse += 0.1 * timeFactor;
    }

    draw() {
        if (this.collected) return;

        const meta = this.powerUpMeta[this.type];
        const pulseScale = 1 + Math.sin(this.pulse) * 0.08;
        
        ctx.save();
        ctx.translate(this.x, this.y);

        // --- LAYER 1: Core Ambient Background Glow ---
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = 25 + Math.sin(this.pulse) * 10;
        
        // --- LAYER 2: Outer Techno Ring (Rotates) ---
        ctx.save();
        ctx.rotate(this.rotation);
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]); // Dashed sci-fi ring effect
        ctx.beginPath();
        ctx.arc(0, 0, this.size * pulseScale * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // --- LAYER 3: Dark Inner Core Orb ---
        ctx.shadowBlur = 0; // Clear shadow to keep the inner core sharp
        ctx.fillStyle = meta.bg;
        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.size * pulseScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // --- LAYER 4: Glowing Foreground Icon ---
        ctx.save();
        // Emojis shouldn't spin or they look messy; text like "×2" stays upright
        if (!meta.isEmoji) {
            ctx.rotate(this.rotation * -0.5); // Slow counter-rotation for text
        }
        
        // Subtle icon pop glow
        ctx.shadowColor = meta.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = meta.isEmoji ? "#ffffff" : meta.color;
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Offset adjustment: clean up vertical text alignment differences
        const yOffset = meta.isEmoji ? 0 : 1; 
        ctx.fillText(meta.icon, 0, yOffset);
        ctx.restore();

        ctx.restore();
    }

    collidesWith(bird) {
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        const targetDist = game_config.birdRadius + (this.size * 1.2); // Generous hitbox for outer ring
        return (dx * dx + dy * dy) < (targetDist * targetDist);
    }
}

class Tree {
    constructor() {
        this.scale = 0.7 + Math.random() * 0.7;
        this.y = canvasHeight - game_config.groundHeight + Math.min(Math.random() * 15, 15) - this.scale;
        this.x = canvasWidth + 40;
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
        this.y = canvasHeight - game_config.groundHeight + Math.min(Math.random() * 15, 15) - this.scale;
        this.x = canvasWidth + 20;
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
        ctx.shadowColor = 'rgba(47, 126, 47, 0.64)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 12;
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
        return dx*dx+dy*dy < (game_config.birdRadius + 20) * (game_config.birdRadius + 20);
    }
}

class Cloud {
    constructor() {
        this.reset();
        this.x = Math.random() * canvasWidth;
    }

    reset() {
        this.x = canvasWidth + Math.random() * 300;
        this.y = 30 + Math.random() * (canvasHeight * 0.3);
        this.scale = 0.85 + Math.random() * 0.7;
        this.speed = 0.5 + Math.random() * 0.4;
    }

    update(dt) {
        this.x -= (this.speed * gameSpeedMultiplier * (dt / 16.67)) + this.scale;
        if (this.x + 200 * this.scale < 0) {
            this.reset();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x,this.y);
        ctx.scale(this.scale,this.scale);
        const g = ctx.createRadialGradient(25, 10, 5, 25, 10, 70);
        g.addColorStop(0, lerpColor('rgb(255,255,255)', 'rgb(134, 134, 189)' , 0.95, skyBrightness, 'oklch'));
        g.addColorStop(.5, lerpColor('rgb(255,255,255)', 'rgb(159, 157, 207)', 0.72, skyBrightness, 'oklch'));
        g.addColorStop(1, lerpColor('rgb(255, 255, 255)', 'rgb(134, 162, 197)',  0.18, skyBrightness, 'oklab'));
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
        // Generate a random initial phase so stars don't blink in unison
        this.phase = Math.random() * Math.PI * 2; 
    }

    reset() {
        this.x = Math.random() * canvasWidth;
        // Restrict stars to the top half of the screen
        this.y = Math.random() * (canvasHeight * 0.48); 
        this.radius = 0.5 + Math.random() * 1.5;
        this.speed = 0.015 + Math.random() * 0.02;
        this.rotation = Math.random() * Math.PI; // Custom rotation angle
        
        // Pick a realistic star color tint
        const colors = [
            '255, 255, 255', // White
            '215, 230, 255', // Ice Blue
            '255, 240, 220'  // Warm Yellow
        ];
        this.baseColor = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        // Increment phase over time
        this.phase += this.speed; 
        // Keep phase values bound cleanly between 0 and 2*PI
        if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;
    }

    draw() {
        // Calculate a clean twinkle multiplier between 0.2 and 1.0
        const twinkle = 0.6 + 0.4 * Math.sin(this.phase);
        const currentAlpha = 0.3 + 0.7 * Math.sin(this.phase);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // Core calculation for flare length
        const r = this.radius * 3.5 * twinkle;

        // HIGH PERFORMANCE GLOW: Replaces heavy radial gradients
        ctx.shadowBlur = this.radius * 4 * twinkle;
        ctx.shadowColor = `rgba(${this.baseColor}, ${currentAlpha})`;
        ctx.fillStyle = `rgba(${this.baseColor}, ${currentAlpha})`;

        // Draw 4-pointed sharp sparkle using Quadratic Curves
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);   // Top to Right
        ctx.quadraticCurveTo(0, 0, 0, r);   // Right to Bottom
        ctx.quadraticCurveTo(0, 0, -r, 0);  // Bottom to Left
        ctx.quadraticCurveTo(0, 0, 0, -r);  // Left back to Top
        ctx.closePath();
        ctx.fill();

        // Draw intense center white core
        ctx.shadowBlur = 0; // Disable blur for sharp core
        ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6 * twinkle, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, size, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.color = color;

    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += .08;
        this.life--;

    }

    draw() {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, PIE_2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function createCoinExplosion(x, y) {
    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * PIE_2;
        const speed = 2 + Math.random() * 5;
        particles.push(
            new Particle(
                x,
                y,
                Math.random() > .5 ? "#FFD93D" : "#FFF8A5",
                2 + Math.random() * 4,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                35 + Math.random() * 25
            )
        );
    }
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

class DrawGame {
    constructor() {
        this.sky = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        this.sky.addColorStop(0, lerpColor("#2d56d9","#04070f",1,skyBrightness, 'oklch'));
        this.sky.addColorStop(.25, lerpColor("#4b7dff","#0d1447",1,skyBrightness, 'oklch'));
        this.sky.addColorStop(.55, lerpColor("#69d8ff","#18327d",1,skyBrightness, 'oklch'));
        this.sky.addColorStop(.80, lerpColor("#ffe5ac","#4361c7",1,skyBrightness, 'oklch'));
        this.sky.addColorStop(1, lerpColor("#72eed3","#ff9450",1,skyBrightness, 'oklch'));

        this.horizon = ctx.createLinearGradient(0, canvasHeight * .45, 0, canvasHeight);
        this.horizon.addColorStop(0, "rgba(255,255,255,0)");
        this.horizon.addColorStop(.5, "rgba(255,255,255,.05)");
        this.horizon.addColorStop(1, "rgba(180,255,255,.15)");
    }

    drawBackground() {
        if (!this.sky) {
            const sky = ctx.createLinearGradient(0, 0, 0, canvasHeight);
            sky.addColorStop(0, lerpColor("#2d56d9","#04070f",1,skyBrightness, 'oklch'));
            sky.addColorStop(.25, lerpColor("#4b7dff","#0d1447",1,skyBrightness, 'oklch'));
            sky.addColorStop(.55, lerpColor("#69d8ff","#18327d",1,skyBrightness, 'oklch'));
            sky.addColorStop(.80, lerpColor("#ffe5ac","#4361c7",1,skyBrightness, 'oklch'));
            sky.addColorStop(1, lerpColor("#72eed3","#ff9450",1,skyBrightness, 'oklch'));
            ctx.fillStyle = sky;
        } else {
            ctx.fillStyle = this.sky;
        }
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Floating Glow Circles
        for (let i = 0; i < 18; i++) {
            const x = (frameCount * .15 + i * 130) % (canvasWidth + 100) - 50;
            const y = 70 + Math.sin(frameCount * .01 + i) * 35 + i * 10;
            ctx.fillStyle = "rgba(108, 189, 255, 0.04)";
            ctx.beginPath();
            ctx.arc(x, y, 18, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Atmospheric Waves
        for (let i = 0; i < 5; i++) {
            const alpha = 0.1 + i / 100;
            ctx.fillStyle = `rgba(78, 137, 165, ${String(alpha)})`;
            const y = 120 + i * 75 + Math.sin(frameCount * .007 + i) * 10;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(canvasWidth * .2, y - 25, canvasWidth * .4, y + 30, canvasWidth * .6, y);
            ctx.bezierCurveTo(canvasWidth * .8, y - 30, canvasWidth, y + 20, canvasWidth, y + 60);
            ctx.lineTo(canvasWidth, canvasHeight);
            ctx.lineTo(0, canvasHeight);
            ctx.closePath();
            ctx.fill();
        }

        // Horizon Glow
        if (!this.horizon) {
            const horizon = ctx.createLinearGradient(0, canvasHeight * .45, 0, canvasHeight);
            horizon.addColorStop(0, "rgba(255,255,255,0)");
            horizon.addColorStop(.5, "rgba(255,255,255,.05)");
            horizon.addColorStop(1, "rgba(180,255,255,.15)");
            ctx.fillStyle = horizon;
        } else {
            ctx.fillStyle = this.horizon;
        }
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Sparkles
        for (let i = 0; i < 90; i++) {
            const x = (i * 91) % canvasWidth;
            const y = (i * 37) % 330;
            const pulse = .25 + .75 * Math.sin(frameCount * .02 + i);
            ctx.fillStyle = `rgba(255,255,255,${0.15 * pulse})`;
            ctx.fillRect(x, y, 2, 2);
        }

        // drawFloatingIsland(canvasWidth * .28 + Math.sin(frameCount * .004) * 25, 170, 0.9);
        // drawFloatingIsland(canvasWidth * .72 + Math.sin(frameCount * .005 + 2) * 18, 130, .7);

        mountainOffset1 = (mountainOffset1 - .15) % 420;
        mountainOffset2 -= 0.35;
        mountainOffset3 -= 0.7;

        if (mountainOffset1 <= -420) mountainOffset1 = 0;
        if (mountainOffset2 <= -360) mountainOffset2 = 0;
        if (mountainOffset3 <= -300) mountainOffset3 = 0;

        this.drawSunAndMoon();
        // this.drawMountainLayer(lerpColor("#1a2340","#2d5da8",skyBrightness),270,90,420,mountainOffset1);
        // this.drawMountainLayer(lerpColor("#243a63","#4474bf",skyBrightness),220,130,360,mountainOffset2);
        // this.drawMountainLayer(lerpColor("#345387","#6fa2ea",skyBrightness),170,110,300,mountainOffset3);

        for (let i = 0; i < 25; i++) {
            const speed = 1 + Math.sin(i * 17.3) * 0.4 + 1.5;
            const length = 60 + (Math.sin(i * 9.7) + 1) * 50;
            // Move RIGHT ➜ LEFT
            const x = canvasWidth + length - ((frameCount * speed + i * 145) % (canvasWidth + length * 2))
            const y = 40 + i * 22 + Math.sin(frameCount * 0.015 + i * 0.8) * 12;
            const curve = Math.sin(frameCount * 0.05 + i) * 8;
            const gradient = ctx.createLinearGradient(x, y, x - length, y);

            gradient.addColorStop(0, `rgba(255, 255, 255, 0.17)`);
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

        ctx.save();
        ctx.globalAlpha = 1 - skyBrightness;
        stars.forEach(star => {star.draw();});
        ctx.restore();
        clouds.forEach(cloud => {cloud.draw();});
        
        if(powerUpsState.dash) {
            for(let i = 0; i < 35; i++) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.44)";
                ctx.beginPath();
                const x = Math.random() * canvasWidth;
                const y = Math.random() * canvasHeight;
                ctx.moveTo(x, y);
                ctx.lineTo(x - 50, y);
                ctx.stroke();
            }
        }
    }

    drawSunAndMoon() {
        const t = worldTime / DAY_LENGTH;
        const angle = t * Math.PI * 2 - Math.PI;
        const radius = 360;
        const cx = canvasWidth / 2 + canvasWidth / 4;
        const cy = canvasHeight / 6 * 3.5;
        const sunX = cx + Math.cos(angle) * radius;
        const sunY = cy + Math.sin(angle) * radius;
        const moonX = cx + Math.cos(angle + Math.PI) * radius;
        const moonY = cy + Math.sin(angle + Math.PI) * radius;
        // Sun
        ctx.shadowColor = "#ffe66d";
        ctx.shadowBlur = 120;
        const g = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 90);
        g.addColorStop(0,"#ffe18e");
        g.addColorStop(.25,"#fff28cc4");
        g.addColorStop(.7,"#ffca3a91");
        g.addColorStop(1,"rgba(255,202,58,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sunX,sunY,90,0,PIE_2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#ffe27a";
        ctx.shadowColor = "rgba(236, 167, 76, 0.82)";
        ctx.shadowBlur = 35;
        ctx.arc(sunX,sunY,38,0,PIE_2);
        ctx.fill();
        // MOON
        ctx.save();
        ctx.translate(moonX, moonY);
        ctx.rotate(0.35);

        const moonR = 27;
        ctx.shadowBlur = 0; 
        const moonGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, moonR * 2.2);
        moonGlow.addColorStop(0, "rgba(200, 225, 255, 0.4)");   // Inner bright core glow
        moonGlow.addColorStop(0.3, "rgba(140, 185, 255, 0.15)"); // Mid-atmosphere bloom
        moonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");           // Smooth fade to space
        
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(0, 0, moonR * 2.2, 0, Math.PI * 2);
        ctx.fill();
        
        const moonGrad = ctx.createLinearGradient(-moonR, -moonR, moonR, moonR);
        moonGrad.addColorStop(0, "#ffffff");   // Blazing lit edge
        moonGrad.addColorStop(0.6, "#f5f9ff"); // Soft body color
        moonGrad.addColorStop(1, "#b5ceff");   // Deep shadow terminator mix
        ctx.fillStyle = moonGrad;

        ctx.beginPath();
        ctx.arc(0, 0, moonR, -Math.PI / 2, Math.PI / 2, false);
        ctx.quadraticCurveTo(moonR * 0.45, 0, 0, -moonR);
        
        ctx.closePath();
        ctx.fill();

        ctx.restore(); // Restores from moon translate/rotate
        // Clean up canvas states safely
        ctx.shadowBlur = 0;
    }

    drawMountainLayer(color, y, peakHeight, widthSize, offset) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-widthSize + offset, canvasHeight);
        for (let x = -widthSize; x < canvasWidth + widthSize * 2; x += widthSize) {
            ctx.lineTo(x + offset, canvasHeight - y);
            ctx.lineTo(x + widthSize * 0.5 + offset, canvasHeight - y - peakHeight);
            ctx.lineTo(x + widthSize + offset, canvasHeight - y);
        }
        ctx.lineTo(canvasWidth + widthSize, canvasHeight);
        ctx.closePath();
        ctx.fill();
    }
}

function drawFloatingIsland(x, y, scale) {
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
    ctx.fillStyle="#885225";
    ctx.beginPath();
    ctx.moveTo(-45,18);
    ctx.lineTo(45,18);
    ctx.lineTo(20,65);
    ctx.lineTo(-15,70);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawGround(){
    const g = ctx.createLinearGradient(0, canvasHeight-game_config.groundHeight, 0, canvasHeight);
    g.addColorStop(0, lerpColor("#69d63d", "rgb(73, 175, 104)", 1, skyBrightness, 'oklch'));
    g.addColorStop(.5, lerpColor("#46b02d", 'rgb(54, 155, 108)', 1, skyBrightness, 'oklch'));
    g.addColorStop(1, lerpColor("#2d7e21", 'rgb(33, 117, 78)', 1, skyBrightness, 'oklch'));
    ctx.fillStyle = g;
    ctx.fillRect(0, canvasHeight - game_config.groundHeight, canvasWidth, game_config.groundHeight);
    // grass
    ctx.fillStyle = lerpColor("#8cff61", 'rgb(98, 204, 124)', 1, skyBrightness, 'oklab');
    ctx.fillRect(0, canvasHeight - game_config.groundHeight, canvasWidth, 6);
    // dirt dots
    for(let i = 0; i < canvasWidth; i += 20){
        ctx.fillStyle = "rgba(170, 106, 54, 0.32)";
        ctx.beginPath();
        ctx.arc(i, canvasHeight - 20 + Math.sin(i) * 2, 2, 0, PIE_2); 
        ctx.fill();
    }
}

function updateWorldTime(dt) {
    worldTime += dt;
    if(worldTime >= DAY_LENGTH) {
        worldTime = 0;
    }
    skyBrightness = (Math.sin(worldTime * Math.PI * 2 / DAY_LENGTH - Math.PI/2) + 1) / 2;
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

function lerpColor(color1, color2, alphaModifier, t, colorType = 'rgba') {
    const clampedT = t < 0 ? 0 : (t > 1 ? 1 : t);
    const targetSpace = colorType.toLowerCase();

    // Fast inline conversion: Oklab -> Bounded sRGB Gamut Mapper
    const oklabToSrgb = (L, a, b) => {
        const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
        const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
        const s = Math.pow(L - 0.0894841775 * a - 1.2914855414 * b, 3);
        const R = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        const clmp = v => Math.max(0, Math.min(255, Math.round((v > 0.0031308 ? 1.055 * Math.pow(v, 0.4166666) - 0.055 : 12.92 * v) * 255)));
        return [clmp(R), clmp(G), clmp(B)];
    };

    // --- 1. HIGH-SPEED EXTRACTION ENGINE (FIXED) ---
    const parseColorFlat = (str) => {
        if (!str) return [0, 0, 0, 1];
        let s = str.trim().toLowerCase();
        
        // CSS Variable Fallback Engine
        if (s.charCodeAt(0) === 118) { // starts with 'v' for var(
            const idx = s.indexOf(',');
            s = idx !== -1 ? s.slice(idx + 1, s.lastIndexOf(')')).trim() : 'black';
        }
        
        // FIX: Swapped string sanitization ordering to guarantee single spaces and eliminate empty string tokens
        s = s.replace(/color\s+display-p3/g, 'display-p3')
             .replace(/[\/\(\),]/g, ' ')
             .replace(/\s+/g, ' ');
             
        const tk = s.split(' ').filter(Boolean);
        if (tk.length === 0) return [0, 0, 0, 1];

        const space = tk[0];
        const val = (idx, max = 1) => {
            const token = tk[idx];
            if (!token) return 0;
            if (token.endsWith('%')) return (parseFloat(token) / 100) * max;
            return parseFloat(token);
        };

        if (['oklch', 'oklab', 'lab', 'display-p3'].includes(space)) {
            const L = val(1, space === 'lab' ? 100 : 1);
            const c2 = val(2, space === 'lab' ? 125 : 1);
            const c3 = val(3, space === 'lab' ? 125 : space === 'oklch' ? 360 : 1);
            const a  = tk[4] !== undefined ? val(4, 1) : 1;

            if (space === 'display-p3') {
                const R = L * 1.2249401 - c2 * 0.2247164 - c3 * 0.0002237;
                const G = -L * 0.0753066 + c2 * 1.0753066 - c3 * 0.0000000;
                const B = -L * 0.0197415 - c2 * 0.0786358 + c3 * 1.0983773;
                const clmp = v => Math.max(0, Math.min(255, Math.round(v * 255)));
                return [clmp(R), clmp(G), clmp(B), a];
            }

            if (space === 'oklch') {
                const rad = c3 * 0.01745329251; // Math.PI / 180
                return [...oklabToSrgb(L, c2 * Math.cos(rad), c2 * Math.sin(rad)), a];
            }
            if (space === 'oklab') return [...oklabToSrgb(L, c2, c3), a];
            
            // FIX: Remapped CIE Lab to convert down into native, separate matrix channels safely
            const fy = (L + 16) / 116, fx = c2 / 500 + fy, fz = fy - c3 / 200;
            const fI = v => v * v * v > 0.008856 ? v * v * v : (v - 16 / 116) / 7.787;
            const X = fI(fx) * 0.95047, Y = fI(fy), Z = fI(fz) * 1.08883;
            const R = X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314;
            const G = -X * 0.9692660 + Y * 1.8760108 + Z * 0.0415560;
            const B = X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252;
            const clmp = v => Math.max(0, Math.min(255, Math.round((v > 0.0031308 ? 1.055 * Math.pow(v, 1 / 2.4) - 0.055 : 12.92 * v) * 255)));
            return [clmp(R), clmp(G), clmp(B), a];
        }

        // FIX: Fixed token indexing array assignments for functional color inputs
        if (space.startsWith('rgb')) {
            return [
                Math.max(0, Math.min(255, Math.round(tk[1].endsWith('%') ? parseFloat(tk[1]) * 2.55 : parseFloat(tk[1])))),
                Math.max(0, Math.min(255, Math.round(tk[2].endsWith('%') ? parseFloat(tk[2]) * 2.55 : parseFloat(tk[2])))),
                Math.max(0, Math.min(255, Math.round(tk[3].endsWith('%') ? parseFloat(tk[3]) * 2.55 : parseFloat(tk[3])))),
                tk[4] !== undefined ? (tk[4].endsWith('%') ? parseFloat(tk[4]) * 0.01 : parseFloat(tk[4])) : 1
            ];
        }

        let hex = space;
        if (hex.charCodeAt(0) === 35) hex = hex.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
        if (hex.length === 6 || hex.length === 8) {
            return [
                parseInt(hex.slice(0, 2), 16) || 0, parseInt(hex.slice(2, 4), 16) || 0, parseInt(hex.slice(4, 6), 16) || 0,
                hex.length === 8 ? Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) * 0.01 : 1
            ];
        }

        // FIX: Repaired dictionary formatting structure syntax errors
        const keywords = { 
            transparent: [0,0,0,0], red: [255,0,0,1], blue: [0,0,255,1], 
            white: [255,255,255,1], black: [0,0,0,1], gray: [128,128,128,1],
            silver: [192,192,192,1], gold: [255,215,0,1]
        };
        return keywords[hex] || [0, 0, 0, 1];
    };

    const c1 = parseColorFlat(color1), c2 = parseColorFlat(color2);

    // Alpha channel computation
    const mod = typeof alphaModifier === 'string' && alphaModifier.endsWith('%') ? parseFloat(alphaModifier) * 0.01 : parseFloat(alphaModifier);
    const finalAlpha = (c1[3] + (c2[3] - c1[3]) * clampedT) * mod;
    const aStr = (finalAlpha < 0 ? 0 : finalAlpha > 1 ? 1 : finalAlpha).toFixed(2);

    // Transform sRGB parameters into Oklab vector fields for uniform gradients
    const sRgbToOklabFlat = (c) => {
        const trans = v => v / 255 > 0.04045 ? Math.pow((v / 255 + 0.055) / 1.055, 2.4) : (v / 255) / 12.92;
        const R = trans(c[0]), G = trans(c[1]), B = trans(c[2]);
        const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
        const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
        const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
        return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
    };

    const p1 = sRgbToOklabFlat(c1), p2 = sRgbToOklabFlat(c2);
    const L = p1[0] + (p2[0] - p1[0]) * clampedT;
    const a = p1[1] + (p2[1] - p1[1]) * clampedT;
    const b = p1[2] + (p2[2] - p1[2]) * clampedT;

    const sOut = oklabToSrgb(L, a, b);
    const outR = sOut[0], outG = sOut[1], outB = sOut[2];

    // --- OUTPUT HUB ---
    if (targetSpace === 'oklab') return `oklab(${L.toFixed(4)} ${a.toFixed(4)} ${b.toFixed(4)} / ${aStr})`;
    if (targetSpace === 'oklch') {
        let h1 = Math.atan2(p1[2], p1[1]) * 57.295779513, h2 = Math.atan2(p2[2], p2[1]) * 57.295779513;
        h1 = h1 < 0 ? h1 + 360 : h1; h2 = h2 < 0 ? h2 + 360 : h2;
        if (Math.abs(h2 - h1) > 180) h2 > h1 ? h1 += 360 : h2 += 360;
        const h = ((h1 + (h2 - h1) * clampedT) % 360 + 360) % 360;
        const c1_C = Math.hypot(p1[1], p1[2]), c2_C = Math.hypot(p2[1], p2[2]);
        return `oklch(${L.toFixed(4)} ${(c1_C + (c2_C - c1_C) * clampedT).toFixed(4)} ${h.toFixed(2)} / ${aStr})`;
    }
    if (targetSpace === 'lab') {
        const trans = v => v / 255 > 0.04045 ? Math.pow((v / 255 + 0.055) / 1.055, 2.4) : (v / 255) / 12.92;
        const X = (trans(outR) * 0.4124564 + trans(outG) * 0.3575761 + trans(outB) * 0.1804375) / 0.95047;
        const Y = trans(outR) * 0.2126729 + trans(outG) * 0.7151522 + trans(outB) * 0.0721750;
        const Z = (trans(outR) * 0.0193339 + trans(outG) * 0.1191920 + trans(outB) * 0.9503041) / 1.08883;
        const f = v => v > 0.008856 ? Math.cbrt(v) : (7.787 * v) + 0.137931;
        return `lab(${(116 * f(Y) - 16).toFixed(2)} ${(500 * (f(X) - f(Y))).toFixed(2)} ${(200 * (f(Y) - f(Z))).toFixed(2)} / ${aStr})`;
    }
    if (targetSpace === 'hwb' || targetSpace === 'hsl' || targetSpace === 'hsla') {
        const rN = outR / 255, gN = outG / 255, bN = outB / 255, max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
        let h = max === min ? 0 : max === rN ? (gN - bN) / (max - min) : max === gN ? 2 + (bN - rN) / (max - min) : 4 + (rN - gN) / (max - min);
        h = Math.round(h * 60); h = h < 0 ? h + 360 : h;
        if (targetSpace === 'hwb') return `hwb(${h} ${Math.round(min * 100)}% ${Math.round((1 - max) * 100)}% / ${aStr})`;
        let l = (max + min) * 0.5, sat = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
        return `hsla(${h % 360}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%, ${aStr})`;
    }
    if (targetSpace === 'hex' || targetSpace === 'hexa') {
        const fH = v => v.toString(16).padStart(2, '0');
        return `#${fH(outR)}${fH(outG)}${fH(outB)}${finalAlpha >= 0.99 ? '' : fH(Math.max(0, Math.min(255, Math.round(finalAlpha * 255))))}`;
    }
    return `rgba(${outR}, ${outG}, ${outB}, ${aStr})`;
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

function drawRainbowTrail() {
    const rainbow = [
        "#ff5e5e",
        "#ffb347",
        "#fff95b",
        "#66ff99",
        "#56b6ff",
        "#a56cff"
    ];

    for(let i = 0; i < 10; i++) {
        ctx.fillStyle = rainbow[(frameCount + i) % rainbow.length];
        ctx.globalAlpha = .5 - i * .075;
        ctx.beginPath();
        ctx.arc(
            bird.x - 12 - i * 5,
            bird.y +
            Math.sin(frameCount * .2 + i) * 2,
            6 - i * .4,
            0,
            PIE_2
        );
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function activatePowerUp(type) {
    let multiplier = 1;

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
            multiplier = 0.9
            birdScale = .55;
            break;
        case "slowMotion":
            powerUpsState.slowMotion = true;
            powerUpTimers.slowMotion = 12 * 60;
            birdScale = 0.95
            multiplier = .65;
            break;
        case "dash":
            powerUpsState.dash = true;
            powerUpTimers.dash = 8 * 60;
            multiplier = 2;
            break;
        case "phoenix": 
            powerUpsState.phoenix = true; 
            break;
    }

    gameSpeedMultiplier = multiplier || 1;
}

function updatePowerUps() {
    Object.keys(powerUpTimers).forEach(key => {
        if(powerUpTimers[key] > 0) {
            powerUpTimers[key] -= 1;
            if (powerUpTimers[key] == 0) {
                powerUpsState[key] = false;
            }
        }
    });
    if(!powerUpsState.tinyBird){
        birdScale = 1;
    }

    if (powerUpsState.dash) {
        bird.x = canvasWidth * .275;
    } else {
        bird.x = canvasWidth * .22;
    }
    gameSpeedMultiplier = powerUpsState.dash? 2 : powerUpsState.slowMotion ? 0.65 : 1;
}

function revivePlayer(){
    powerUpsState.phoenix = false;
    bird.y = canvasHeight / 2;
    bird.velocity = 0;
    bird.jump();
    bird.x = canvasWidth * .22;
    pipes = pipes.filter(pipe => pipe.x > bird.x + 200);
    bushes = bushes.filter(bush => bush.x > bird.x + 180);
    coins = coins.filter(coin => coin.x > bird.x + 120);
    powerUps = powerUps.filter(p => p.x > bird.x + 120);
}

function spawnObjects() {
    const difficulty = score * game_config.difficultyRamp;

    if (frameCount - lastPipeTime > Spawn_Rates.pipeSpawnRate - Math.min(difficulty, 18)) {
        pipes.push(new Pipe());
        lastPipeTime = frameCount;
    }

    if (pipes.length > game_config.maxPipes) {
        pipes.splice(0, pipes.length - game_config.maxPipes);
    }
    if (frameCount - lastTreeTime > Spawn_Rates.treeSpawnRate - Math.min(difficulty, 16) * 0.25) {
        trees.push(new Tree());
        lastTreeTime = frameCount;
    }
    if (frameCount - lastBushTime > Spawn_Rates.treeSpawnRate + 26 - Math.min(difficulty, 14)) {
        bushes.push(new Bush());
        lastBushTime = frameCount;
    }
    if (frameCount - lastCoinTime > Spawn_Rates.coinSpawnRate + 6 - Math.min(difficulty, 6)) {
        const minY = 100;
        const maxY = canvasHeight - game_config.groundHeight - 100;
        coins.push(new Coin(canvasWidth + 40, minY + Math.random() * (maxY - minY)));
        lastCoinTime = frameCount;
    }
    
    // Spawn power-ups occasionally
    if (frameCount - lastPowerUpTime > Spawn_Rates.coinSpawnRate * 3 && Math.random() > 0.6) {
        const minY = 100;
        const maxY = canvasHeight - game_config.groundHeight - 100;
        powerUps.push(new PowerUp(canvasWidth + 40, minY + Math.random() * (maxY - minY)));
        lastPowerUpTime = frameCount;
    }

    if(powerUpsState.dash) {
        spawnDashParticle();
    }
}

function updateGameObjects(dt) {
    if (lastFrameTime === 0) lastFrameTime = dt;

    stars.forEach(star => star.update());
    clouds.forEach(cloud => cloud.update(dt));
    bird.update(dt);
    trees.forEach(tree => tree.update(dt));
    bushes.forEach(bush => bush.update(dt));
    pipes.forEach(pipe => pipe.update(dt));
    coins.forEach(coin => {
        coin.update(dt);
        if(powerUpsState.magnet) {
            const dx = bird.x - coin.x;
            const dy = bird.y - coin.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if(dist < 170) {
                coin.x += dx * .08;
                coin.y += dy * .08;
            }
        }});
    powerUps.forEach(pu => pu.update(dt));
}


function initGame({ jumpImmediately = true } = {}) {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    bird = new Bird();
    pipes = [];
    clouds = Array.from({ length: window.innerWidth > 768 ? 6 : 4 }, () => new Cloud());
    stars = Array.from({ length: Math.max(36, Math.min(70, Math.round((canvasWidth / BASE_WIDTH) * 70))) }, () => new Star());
    trees = [];
    bushes = [];
    coins = [];
    powerUps = [];
    particles = [];
    frameCount = 0;
    score = 0;
    flashTimer = 0;
    lastFrameTime = 0;
    lastPipeTime = 0;
    lastCoinTime = 0;
    lastTreeTime = 0;
    lastBushTime = 0;
    lastPowerUpTime = 0;

    gameState = Game_State.running;
    updateHud();
    startOverlay.classList.remove('visible');
    gameOverOverlay.classList.remove('visible');
    if (jumpImmediately && bird) {
        bird.jump();
    }
    animationFrameId = requestAnimationFrame(gameLoop);
}

function endGame() {
    try {
        if (gameState === Game_State.start) {
            throw new Error("Cannot call endGame() while game hasn't started");
        }
        gameState = Game_State.game_over;
        bestScore = Math.max(bestScore, score);
        saveStoredStats();
        updateHud();
        
        const isNewBest = score >= bestScore;
        const bestLabel = isNewBest ? '🏆 NEW BEST!!' : `Best: ${bestScore}`;
        
        finalMessage.textContent = `Score: ${score} · ${bestLabel} · Coins: ${coinCount}`;
        gameOverOverlay.classList.add('visible');
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    } catch(error) {
        console.error('Error: ', error);
    }
}

function gameLoop(timestamp) {
    try {
        ctx.save();
        const dt = Math.min(timestamp - lastFrameTime, 32);
        lastFrameTime = timestamp;

        switch (gameState) {
            case Game_State.start:
                loadStoredStats();
                break;

            case Game_State.running:
                const renderer = new DrawGame();
                frameCount += 1;
                ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                renderer.drawBackground();
                drawGround();
                updateWorldTime(dt);
                updateGameObjects(dt);
                drawPowerUps();
                updatePowerUps();

                trees.forEach(tree => tree.draw());
                bushes.forEach(bush => {
                    bush.draw();
                    if (bush.collidesWith(bird)) {
                        bird.jump();
                        triggerFlash();
                        score = Math.max(0, score - 1);
                        screenShake(2);
                    }
                });
                
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
                        screenShake(18);
                        hitPlayer();
                    }
                });

                coins.forEach(coin => {
                    coin.draw();
                    if (!coin.collected && coin.collidesWith(bird)) {
                        coin.collected = true;
                        coinCount += 1;
                        createCoinExplosion(coin.x, coin.y);
                        screenShake(6);
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
                bird.draw();
                
                particles.forEach(p => {
                    p.update(); 
                    p.draw();
                });

                drawDashTrail();
                drawRainbowTrail();
                spawnObjects();

                pipes = pipes.filter(pipe => pipe.x + pipe.width > -pipe.width - 2);
                coins = coins.filter(coin => !coin.collected && coin.x + coin.size > -20);
                bushes = bushes.filter(bush => bush.x + bush.width > -20);
                powerUps = powerUps.filter(pu => !pu.collected && pu.x + pu.size > -20);
                particles = particles.filter(p => p.life > 0);
                trees = trees.filter(tree => tree.x + 80 > -20);

                if (flashTimer > 0) {
                    flashTimer -= 1;
                    if (flashTimer <= 0) {
                        hitFlash.classList.remove('active');
                    }
                }
                animationFrameId = requestAnimationFrame(gameLoop);
                break;

            case Game_State.game_over:
                Object.keys(powerUpTimers).forEach(key => {
                    if(powerUpTimers[key] > 0) {
                        powerUpTimers[key] = 0;
                        powerUpsState[key] = false;
                    }
                });
                break;

            default:
                console.error(`Unknown game state:`, gameState);
                break;
        }
    } catch(error) {
        console.error('Error:', error);
    } finally {
        ctx.restore();
    }
}

function jumpAction() {
    if (gameState === Game_State.start) {
        initGame();
        return;
    }
    if (gameState === Game_State.game_over) return;
    if (bird) {
        bird.jump();
    }
}

window.addEventListener('keydown', event => {
    if (event.code === 'Space') {
        event.preventDefault();
        if (gameState === Game_State.game_over) return;
        jumpAction();
    }
});

window.addEventListener('pointerdown', event => {
    if (event.target instanceof Element && event.target.closest('button')) {
        return;
    }
    if (gameState === Game_State.game_over) return;
    jumpAction();
});

startButton.addEventListener('click', () => {
        initGame({ jumpImmediately: true });
        if (gameState !== Game_State.running) {
            gameState = Game_State.running;
        }
});

window.addEventListener('click', () => {
    const bg_audio = document.getElementById('bg-audio');
    bg_audio.volume = 0.4;
    bg_audio.loop = true;
    if (gameState !== Game_State.running) { 
        bg_audio.play().catch(error => {
            console.warn("Audio playback paused: Waiting for the player to click the screen first.");
        });
    } else {
        bg_audio.pause();
    }
}, {once: true});

retryButton.addEventListener('click', () => initGame({ jumpImmediately: true }));
window.addEventListener('resize', resizeCanvas);
loadStoredStats();
updateHud();
resizeCanvas();