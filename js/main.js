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
const BASE_WIDTH = 820, BASE_HEIGHT = 620;
const STORAGE_KEY = 'air-jumper-stats';

let canvasWidth = BASE_WIDTH, canvasHeight = BASE_HEIGHT;
let devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

let bird;

let pipes, clouds, stars, trees, bushes, coins, particles, powerUps;

let frameCount;
let score;
let coinCount = 0, bestScore = 0;

let lastPipeTime = 0, lastCoinTime = 0, lastTreeTime = 0, lastBushTime = 0, lastPowerUpTime = 0;

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
    pipeSpawnRate: 75,
    coinSpawnRate: 55,
    treeSpawnRate: 20
}

const powerUpsState = {
    shield: false,
    magnet: false,
    doubleScore: false,
    doubleCoin: false,
    tinyBird: false,
    slowMotion: false,
    dash: false,
    phoenix: false,
    laser: false, 
    gravityFlip: false, 
    coinBlast: false,
    shadowClone: false
};

const powerUpTimers = {
    shield: 0,
    magnet: 0,
    doubleScore: 0,
    doubleCoin: 0,
    tinyBird: 0,
    slowMotion: 0,
    dash: 0, 
    laser: 0, 
    gravityFlip: 0,
    shadowClone: 0
};

let gameState = Game_State.start;

let birdScale = 1;
let gameSpeedMultiplier = 1;
let dashTrail = [];

// Object pools for performance
const pipePool = [], coinPool = [], bushPool = [], powerUpPool = [];

let statsCache = { bestScore: 0, coinCount: 0 };
let isCacheLoaded = false;

function loadStoredStats() {
    if (isCacheLoaded) return;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            isCacheLoaded = true;
            return;
        }

        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.bestScore === 'number' && Number.isFinite(parsed.bestScore)) {
                bestScore = parsed.bestScore;
                statsCache.bestScore = bestScore;
            }
            if (typeof parsed.coinCount === 'number' && Number.isFinite(parsed.coinCount)) {
                coinCount = parsed.coinCount;
                statsCache.coinCount = coinCount;
            }
            isCacheLoaded = true;
        }
    } catch (error) {
        console.warn('Unable to load saved stats safely, resetting cache:', error);
        statsCache.bestScore = typeof bestScore === 'number' ? bestScore : 0;
        statsCache.coinCount = typeof coinCount === 'number' ? coinCount : 0;
    }
}

function saveStoredStats() {
    try {
        if (bestScore === statsCache.bestScore && coinCount === statsCache.coinCount) {
            return; 
        }
        statsCache.bestScore = bestScore;
        statsCache.coinCount = coinCount;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(statsCache));
    } catch (error) {
        console.warn('Unable to write data payload onto local storage drive:', error);
    }
}

function hitPlayer() {
    if (powerUpsState.dash) {
        // Safe tracking protection checks
        const radius = (typeof game_config !== "undefined" && game_config.birdRadius) ? game_config.birdRadius : 24;
        const groundH = (typeof game_config !== "undefined" && game_config.groundHeight) ? game_config.groundHeight : 100;
        const currentHeight = (typeof canvasHeight !== "undefined") ? canvasHeight : 600;

        if (bird && (bird.y + radius >= currentHeight - groundH)) {
            if (typeof bird.jump === "function") bird.jump();
        }
        return;
    }

    if (powerUpsState.shield) {
        if (typeof triggerFlash === "function") triggerFlash();
        setTimeout(() => {
            powerUpsState.shield = false;
        }, 1300);
        if (typeof powerUpTimers !== "undefined") {
            powerUpTimers.shield = 0; 
        }
        
        if (typeof screenShake === "function") screenShake(8); // Juicy impact shake
        return;
    }

    if (powerUpsState.phoenix) {
        if (typeof revivePlayer === "function") {
            revivePlayer();
        } else {
            powerUpsState.phoenix = false;
            gameState = Game_State.game_over;
            if (typeof endGame === "function") endGame();
        }
        return;
    }

    gameState = Game_State.game_over;
    if (typeof triggerFlash === "function") triggerFlash();
    saveStoredStats(); 
    if (typeof endGame === "function") endGame();
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

function screenShake(intensity) {
    try {
        ctx.save();
        if(intensity > 0 && typeof intensity === "number") {
            ctx.translate(
                (Math.random() - .5) * intensity,
                (Math.random() - .5) * intensity
            );
            intensity *= .9;
            if (intensity < .1) intensity = 0;
        } else {
            console.error(`Wrong screen shake value: `, intensity);
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

        if (powerUpsState.gravityFlip) {
            // Invert gravity force direction smoothly
            if (this.gravity > 0) this.gravity = -Math.abs(this.gravity);
        } else {
            if (this.gravity < 0) this.gravity = Math.abs(this.gravity);
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

        // 1. Bird Shadow
        ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
        ctx.shadowBlur = 22;

        // 2. Bird Body Gradient
        const gradient = ctx.createRadialGradient(-4, -4, 4, 0, 0, game_config.birdRadius * 1.5);
        gradient.addColorStop(0, '#fff7b8');
        gradient.addColorStop(0.25, '#ffd166');
        gradient.addColorStop(1, '#f6ae2d');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, game_config.birdRadius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Wings (Layered behind the body)
        const flap = Math.sin(frameCount * 0.45) * 12;
        ctx.fillStyle = "#ffd94d";
        
        ctx.beginPath();
        ctx.ellipse(-10, flap, 10, 5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.ellipse(10, flap, 10, 5, 0.5, 0, Math.PI * 2);
        ctx.fill();

        // 4. Eye 
        ctx.fillStyle = '#162a44';
        ctx.beginPath();
        ctx.arc(6, -2, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // 5. Outer Outline
        ctx.strokeStyle = '#1a49a1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 2, game_config.birdRadius + 2, 0, Math.PI * 2);
        ctx.stroke();

        // 6. Powerups
        ctx.shadowBlur = 0;
        ctx.beginPath();
        this.birdPowerUps();
        ctx.closePath();
    }

    birdPowerUps() {
        if (!PIE_2) {
            const PIE_2 = Math.PI * 2;
        }

        // LASER BEAM
        if (powerUpsState.laser) {
            ctx.save();
            
            // Origin locks cleanly onto the front face of the bird character model matrix
            const lx = 14; 
            const beamLength = 750; 
            const flicker = Math.sin(Date.now() * 0.08);
            
            // A. LAYER 1: Mega-Wide Plasma Glow Envelope
            ctx.strokeStyle = "rgba(255, 0, 60, 0.25)";
            ctx.lineWidth = 32 + flicker * 8;
            ctx.beginPath();
            ctx.moveTo(lx, 0); ctx.lineTo(lx + beamLength, 0);
            ctx.stroke();

            // B. LAYER 2: Hot Ionized Crimson Core Beam
            ctx.strokeStyle = "#ff003c";
            ctx.lineWidth = 14 + flicker * 4;
            ctx.shadowColor = "#ff3300";
            ctx.shadowBlur = 25; // High bloom impact layer
            ctx.beginPath();
            ctx.moveTo(lx, 0); ctx.lineTo(lx + beamLength, 0);
            ctx.stroke();

            // C. LAYER 3: White-Hot Concentrated Energy Core Rail
            ctx.shadowBlur = 0; 
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4 + Math.abs(flicker) * 2;
            ctx.beginPath();
            ctx.moveTo(lx, 0); ctx.lineTo(lx + beamLength, 0);
            ctx.stroke();

            // D. BURNING EFFECTS ENGINE: Spawns high-intensity sparks into your global array
            if (Math.random() < 0.45 && typeof particles !== "undefined") {
                // Converts the bird's relative face translation out into screen coordinates
                const globalLaserX = this.x + lx * Math.cos(this.rotation);
                const globalLaserY = this.y + lx * Math.sin(this.rotation);

                for (let i = 0; i < 2; i++) {
                    particles.push({
                        x: globalLaserX + Math.random() * 20,
                        y: globalLaserY + (Math.random() - 0.5) * 15,
                        vx: (Math.random() * 3 + 1) * gameSpeedMultiplier,
                        vy: (Math.random() - 0.5) * 4,
                        size: Math.random() * 4 + 2,
                        life: 30,
                        maxLife: 30,
                        color: Math.random() < 0.6 ? "#ffcc00" : "#ff3300",
                        update: function(timeFactor) {
                            this.x += this.vx;
                            this.y += this.vy;
                            this.vy += 0.1; // Subtle gravitational fall for burning embers
                            this.size = Math.max(0.1, this.size * 0.94);
                            this.life--;
                        },
                        draw: function() {
                            ctx.save();
                            ctx.setTransform(1, 0, 0, 1, 0, 0); // Resets context safely to screen-space
                            ctx.globalAlpha = this.life / this.maxLife;
                            ctx.fillStyle = this.color;
                            ctx.beginPath();
                            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.restore();
                        }
                    });
                }
            }
            ctx.restore();
        }
        
        // --- CLONE RENDERING MECHANIC ---
        if (powerUpsState.shadowClone && this.clones) {
            this.clones.forEach(clone => {
                ctx.save();
                const wave = Math.sin(clone.phase) * 8;
                
                ctx.translate(-25, clone.yOffset + wave);
                ctx.globalAlpha = clone.alpha;

                ctx.shadowColor = '#bd00ff';
                ctx.shadowBlur = 18;

                const cloneGrad = ctx.createRadialGradient(-4, -4, 4, 0, 0, game_config.birdRadius * 1.5);
                cloneGrad.addColorStop(0, '#f9d6ff');
                cloneGrad.addColorStop(0.4, '#bd00ff');
                cloneGrad.addColorStop(1, '#4a0066');

                ctx.fillStyle = cloneGrad;
                ctx.strokeStyle = '#e200ff';
                ctx.lineWidth = 2.5;

                ctx.beginPath();
                ctx.arc(0, 0, game_config.birdRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            });
        }

        if (powerUpsState.shield) {
            ctx.save();
            // Check if shield is critically low (less than 3 seconds / 180 frames left)
            const framesLeft = powerUpTimers.shield;
            const isLow = framesLeft > 0 && framesLeft < 180;
            
            // Base animations
            let pulse = Math.sin(frameCount * 0.1) * 3;
            let bubbleRadius = game_config.birdRadius * 1.8 + pulse;
            
            // Default Blue Colors
            let coreColor = 'rgba(52, 152, 219, 0.1)';
            let glowColor = 'rgba(135, 206, 250, 0.35)';
            let edgeColor = 'rgba(52, 152, 219, 0.7)';
            let strokeColor = '#5dade2';
            let glowHex = '#3498db';

            if (isLow) {
                // Speed up the pulse animation mathematically to look unstable
                pulse = Math.sin(frameCount * 0.3) * 6; 
                bubbleRadius = game_config.birdRadius * 1.8 + pulse;

                // Make it rapidly flash red/orange using the frameCount math
                const flashState = Math.floor(frameCount / 4) % 2 === 0;
                if (flashState) {
                    coreColor = 'rgba(231, 76, 60, 0.15)';   // Red core tint
                    glowColor = 'rgba(241, 196, 15, 0.4)';   // Orange intermediate
                    edgeColor = 'rgba(231, 76, 60, 0.85)';   // Bright danger edge
                    strokeColor = '#ec7063';
                    glowHex = '#e74c3c';
                }
            }

            // Apply calculated radial glow styles
            const shieldGrad = ctx.createRadialGradient(0, 0, bubbleRadius * 0.5, 0, 0, bubbleRadius);
            shieldGrad.addColorStop(0, coreColor);  
            shieldGrad.addColorStop(0.8, glowColor); 
            shieldGrad.addColorStop(1, edgeColor);   

            ctx.fillStyle = shieldGrad;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.shadowColor = glowHex;
            ctx.shadowBlur = isLow ? 25 : 15; // Makes it glow intensely when unstable

            // Render Shield Globe
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRadius, 0, PIE_2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        if (powerUpsState.magnet) {
            ctx.save();
            // Creates a rotating/moving dashed wave representing magnetic pull
            ctx.strokeStyle = "rgba(255, 100, 100, 0.65)";
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 12]); // Crisp arcade dash lines
            ctx.lineDashOffset = -frameCount * 1.5; // Animates moving inward/outward

            ctx.shadowColor = "rgba(255, 80, 80, 0.5)";
            ctx.shadowBlur = 10;

            ctx.beginPath();
            ctx.arc(0, 0, 170, 0, PIE_2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

class Pipe {
    constructor() {
        this.width = 78;
        // Safety Fallback Check for canvas size environments
        const globalWidth = (typeof canvasWidth !== "undefined") ? canvasWidth : 800;
        this.x = globalWidth + this.width;
        
        // Locked limits ensure calculations never output NaN or break bounds
        this.top = 65 + Math.random() * 250;
        
        const gap = (typeof game_config !== "undefined" && game_config.pipeGap) ? game_config.pipeGap : 150;
        this.bottom = this.top + gap;
        
        this.passed = false;
        this.destroyed = false;      
        this.shatterProgress = 0;    
        
        this.capHeight = 26; 
        this.capOffset = 5;  

        this.gradientStops = ['#1c9c34', '#28eb59', '#4eeb75', '#1bd148', '#0f7d2a'];
    }

    update(dt) {
        try {
            const deltaTime = dt || 16.67;
            const timeFactor = deltaTime / 16.67;
            
            let baseSpeed = 3;
            let ramp = 0.005;
            if (typeof game_config !== "undefined") {
                baseSpeed = game_config.pipeSpeed || baseSpeed;
                ramp = game_config.difficultyRamp || ramp;
            }
            
            const currentScore = (typeof score !== "undefined") ? score : 0;
            const multiplier = (typeof gameSpeedMultiplier !== "undefined") ? gameSpeedMultiplier : 1.0;

            const currentSpeed = baseSpeed + Math.min(currentScore * ramp, 1.2) * 0.5;
            this.x -= currentSpeed * multiplier * timeFactor;

            if (this.destroyed) {
                this.shatterProgress += 0.05 * timeFactor;
            }
        } catch (e) {
            console.warn("Pipe update validation anomaly recovered:", e);
        }
    }

    draw() {
        if (this.destroyed && this.shatterProgress >= 1.0) return;
        try {
            ctx.save();
            ctx.shadowBlur = 0;

            const buildGrad = (xStart, xEnd) => {
                const grad = ctx.createLinearGradient(xStart, 0, xEnd, 0);
                grad.addColorStop(0.0, this.gradientStops[0]);
                grad.addColorStop(0.2, this.gradientStops[1]);
                grad.addColorStop(0.5, this.gradientStops[2]); // Chrome sheen core center
                grad.addColorStop(0.8, this.gradientStops[3]);
                grad.addColorStop(1.0, this.gradientStops[4]);
                return grad;
            };

            const pipeGrad = buildGrad(this.x, this.x + this.width);
            const capGrad = buildGrad(this.x - this.capOffset, this.x + this.width + this.capOffset);
            const capW = this.width + this.capOffset * 2;
            
            const displayHeight = (typeof canvasHeight !== "undefined") ? canvasHeight : 600;
            const bHeight = displayHeight - this.bottom;

            // ENGINE PATH A: INTACT SOLID CYLINDERS
            if (!this.destroyed) {
                ctx.fillStyle = pipeGrad;
                ctx.fillRect(this.x, 0, this.width, this.top - this.capHeight);
                ctx.fillRect(this.x, this.bottom + this.capHeight, this.width, bHeight - this.capHeight);

                ctx.fillStyle = capGrad;
                ctx.fillRect(this.x - this.capOffset, this.top - this.capHeight, capW, this.capHeight);
                ctx.fillRect(this.x - this.capOffset, this.bottom, capW, this.capHeight);

                // Deep crease shadow lines (Shining strip layers fully removed)
                ctx.fillStyle = '#050d14';
                ctx.fillRect(this.x - this.capOffset, this.top - 4, capW, 4);
                ctx.fillRect(this.x - this.capOffset, this.bottom, capW, 4);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(this.x, this.top, this.width, 8);
                ctx.fillRect(this.x, this.bottom + this.capHeight, this.width, 8);

                // Geometric outer line tracing overlays
                ctx.strokeStyle = '#050d14';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.rect(this.x, -5, this.width, this.top - this.capHeight + 5);
                ctx.rect(this.x, this.bottom + this.capHeight, this.width, bHeight + 5);
                ctx.stroke();

                ctx.beginPath();
                ctx.rect(this.x - this.capOffset, this.top - this.capHeight, capW, this.capHeight);
                ctx.rect(this.x - this.capOffset, this.bottom, capW, this.capHeight);
                ctx.stroke();
            } 
            // ENGINE PATH B: FRACTIONAL EXPLOSION MATRIX
            else {
                const ease = this.shatterProgress;
                ctx.globalAlpha = Math.max(0, 1 - ease); 
                ctx.fillStyle = pipeGrad;
                ctx.strokeStyle = '#050d14';
                ctx.lineWidth = 2;

                const push = ease * 120; // Shatter translation modifier

                // Top Fragment Shards
                ctx.fillRect(this.x - push * 0.4, -push * 0.2, this.width * 0.5, this.top * 0.5);
                ctx.strokeRect(this.x - push * 0.4, -push * 0.2, this.width * 0.5, this.top * 0.5);

                ctx.fillRect(this.x + this.width * 0.5 + push * 0.5, -push * 0.4, this.width * 0.5, this.top * 0.7);
                ctx.strokeRect(this.x + this.width * 0.5 + push * 0.5, this.width * 0.5, this.top * 0.7);

                // Bottom Fragment Shards
                ctx.fillRect(this.x - push * 0.6, this.bottom + push * 0.5, this.width * 0.4, bHeight * 0.6);
                ctx.strokeRect(this.x - push * 0.6, this.bottom + push * 0.5, this.width * 0.4, bHeight * 0.6);

                ctx.fillRect(this.x + this.width * 0.4 + push * 0.4, this.bottom + push * 0.3, this.width * 0.6, bHeight * 0.4);
                ctx.strokeRect(this.x + this.width * 0.4 + push * 0.4, this.bottom + push * 0.3, this.width * 0.6, bHeight * 0.4);
            }
        } catch (drawError) {
            console.error("Critical rendering failure recovered seamlessly:", drawError);
        } finally {
            ctx.restore();
        }
    }

    collidesWith(bird) {
        if (this.destroyed || !bird) return false;
        try {
            if (typeof bird.getBounds === "function") {
                const b = bird.getBounds();
                if (b && typeof b.right === "number") {
                    return b.right > this.x && b.left < this.x + this.width && (b.top < this.top || b.bottom > this.bottom);
                }
            }
            
            const actualScale = (typeof birdScale !== "undefined") ? birdScale : 1.0;
            const baseRad = (typeof game_config !== "undefined" && game_config.birdRadius) ? game_config.birdRadius : 24;
            const br = baseRad * actualScale;
            
            return (bird.x + br) > this.x && (bird.x - br) < this.x + this.width && ((bird.y - br) < this.top || (bird.y + br) > this.bottom);
        } catch (collisionError) {
            console.warn("Collision handling matrix bypass invoked:", collisionError);
            return false;
        }
    }
}

class Coin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = Math.random() * Math.PI;
        this.size = 26;
        this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.4) * 0.3;
        this.collected = false;

        // Properties for the floating "+1" text
        this.textYOffset = Math.random() * -2;
        this.textAlpha = 1;
    }

    update(dt) {
        const deltaTime = dt || 16.67;
        const timeFactor = deltaTime / 16.67;

        if (!this.collected) {
            // Normal movement while active
            this.x -= this.speed * gameSpeedMultiplier * timeFactor;
            this.angle += 0.08 * timeFactor; // Snappier spin rate
        } else if (this.textAlpha > 0) {
            // Animate the "+1" score popup after collection
            this.textYOffset -= 1.5 * timeFactor;
            this.textAlpha -= 0.04 * timeFactor;
        }
    }

    draw() {
        if (this.collected && this.textAlpha <= 0) return;
        ctx.save();

        if (!this.collected) {
            ctx.shadowBlur = 0;
            ctx.translate(this.x, this.y);
            
            const currentScaleX = Math.cos(this.angle);
            ctx.scale(Math.abs(currentScaleX), 1);

            // Dynamic lighting depth: shifts color slightly depending on the spin angle
            const isFront = currentScaleX > 0;
            const coinGold = isFront ? '#ffd22e' : '#e6b61f';
            const edgeCopper = isFront ? '#ff7220' : '#d45611';

            ctx.shadowColor = 'rgba(255, 210, 46, 0.6)';
            ctx.shadowBlur = 15;

            ctx.fillStyle = coinGold;
            ctx.beginPath();
            ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0; // Clear shadow for crisp line work
            ctx.strokeStyle = edgeCopper;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, (this.size / 2) - 3, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = edgeCopper;
            ctx.font = `bold ${this.size * 0.6}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", 0, 0.5);

        } else {
            // --- DRAW FLOATING "+1" TEXT ON COLLECTION ---
            ctx.translate(this.x, this.y + this.textYOffset);
            ctx.globalAlpha = Math.max(0, this.textAlpha);
            
            // Golden glow text effect
            ctx.shadowColor = '#e4c556d0';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${this.size * 2}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`+1`, 0, 0);
        }

        ctx.restore();
    }

    collidesWith(bird) {
        if (this.collected) return false;
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        const max = game_config.birdRadius + this.size / 2;
        const isColliding = dx * dx + dy * dy < max * max;
        
        if (isColliding) {
            this.collected = true; // Flips state flag to trigger update text animation
        }
        
        return isColliding;
    }
}

class PowerUp {
    constructor(x, y, forcedType = null) {
        this.x = x;
        this.y = y;
        this.size = 18;
        this.collected = false;
        this.isDead = false; 
        this.rotation = 0;
        this.pulse = Math.random() * Math.PI; 
        
        // Text animation parameters
        this.textYOffset = 0;
        this.textAlpha = 1;
        this.textScale = 0.3; // Starts small for a punchy scale-in effect

        this.powerUpMeta = {
            shield:       { color: "#ff5ca8", bg: "#4a1230", icon: "🛡️", isEmoji: true,  label: "SHIELD!" },
            magnet:       { color: "#ff4040", bg: "#4a1010", icon: "🧲", isEmoji: true,  label: "MAGNET!" },
            doubleScore:  { color: "#ffd93d", bg: "#4a3b0a", icon: "×2", isEmoji: false, label: "2x SCORE!" },
            doubleCoin:   { color: '#fffd90', bg: '#4a3b0a', icon: '2¢', isEmoji: false, label: "2x COINS!" },
            tinyBird:     { color: "#55ff99", bg: "#0f4a27", icon: "⬇",  isEmoji: false, label: "TINY BIRD!" },
            slowMotion:   { color: "#5ac8ff", bg: "#0f364a", icon: "❄️", isEmoji: true,  label: "SLOW MO!" },
            dash:         { color: "#8d5cff", bg: "#250f4a", icon: "⚡", isEmoji: true,  label: "DASH!" },
            laser:        { color: "#ff003c", bg: "#96001e", icon: "💥", isEmoji: true, label: "LASER BEEM!"},
            shadowClone:  { color: "#bd00ff", bg: "#51225e", icon: "👥", isEmoji: true,  label: "SHADOW CLONE!" },
            phoenix:      { color: "#ff7b00", bg: "#4a220f", icon: "🔥", isEmoji: true,  label: "PHOENIX!" }
        };

        const types = Object.keys(this.powerUpMeta);
        this.type = forcedType || types[Math.floor(Math.random() * types.length)];
    }

    update(dt, bird) {
        const deltaTime = dt || 16.67;
        const timeFactor = deltaTime / 16.67;

        if (!this.collected) {
            // --- MAGNETIC ATTRACTION ---
            if (bird) {
                const dx = bird.x - this.x;
                const dy = bird.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Pull range is larger if magnet powerup is already active on the bird
                const attractionRadius = powerUpsState.magnet ? 240 : 160;
                
                if (distance < attractionRadius) {
                    const pullForce = (attractionRadius - distance) * 0.06;
                    this.x += (dx / distance) * pullForce * timeFactor;
                    this.y += (dy / distance) * pullForce * timeFactor;
                }
            }

            // Normal scroll movement
            const speed = (game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5) * gameSpeedMultiplier;
            this.x -= speed * timeFactor;
            
            this.rotation += 0.04 * timeFactor;
            this.pulse += 0.08 * timeFactor;

            // Spawn clean ambiance particles behind active orbs occasionally
            if (Math.random() < 0.15 && typeof particles !== "undefined") {
                const meta = this.powerUpMeta[this.type];
                particles.push({
                    x: this.x + (Math.random() - 0.5) * 10,
                    y: this.y + (Math.random() - 0.5) * 10,
                    vx: -speed * 0.5,
                    vy: (Math.random() - 0.5) * 1,
                    life: 25,
                    maxLife: 25,
                    color: meta.color,
                    update: function() { this.x += this.vx; this.y += this.vy; this.life--; },
                    draw: function() {
                        ctx.save();
                        ctx.globalAlpha = this.life / this.maxLife;
                        ctx.fillStyle = this.color;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                });
            }

        } else if (!this.isDead) {
            // --- EXPONENTIALLY DECAY TEXT POSITION ---
            this.textYOffset -= 1.8 * timeFactor;
            this.textAlpha -= 0.025 * timeFactor;
            this.textScale = Math.min(1.2, this.textScale + 0.08 * timeFactor); // Pops outward
            
            if (this.textAlpha <= 0) {
                this.isDead = true;
            }
        }
    }

    draw() {
        if (this.isDead) return;

        const meta = this.powerUpMeta[this.type];
        const pulseScale = 1 + Math.sin(this.pulse) * 0.08;
        ctx.save();

        if (!this.collected) {
            ctx.translate(this.x, this.y);
            
            // Layer 1: Ambient Neon Base Glow
            ctx.shadowColor = meta.color;
            ctx.shadowBlur = 22 + Math.sin(this.pulse) * 6;
            
            // Layer 2: Complex Dual Techno Rings (Counter-Rotating)
            ctx.save();
            ctx.rotate(this.rotation);
            ctx.strokeStyle = meta.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]); 
            ctx.beginPath();
            ctx.arc(0, 0, this.size * pulseScale * 1.3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.rotate(-this.rotation * 0.6); 
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 8]);
            ctx.beginPath();
            ctx.arc(0, 0, this.size * pulseScale * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Layer 3: High-Contrast Radial Gradient Orb Base
            ctx.shadowBlur = 0; 
            const orbGrad = ctx.createRadialGradient(-this.size * 0.3, -this.size * 0.3, 2, 0, 0, this.size * pulseScale);
            orbGrad.addColorStop(0, '#ffffff');
            orbGrad.addColorStop(0.3, meta.color);
            orbGrad.addColorStop(1, meta.bg);

            ctx.fillStyle = orbGrad;
            ctx.strokeStyle = meta.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.size * pulseScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Glossy crescent highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(-2, -2, this.size * pulseScale * 0.7, 0, Math.PI * 2);
            ctx.fill();

            // Layer 4: Symbol Rendering
            ctx.save();
            if (!meta.isEmoji) {
                ctx.rotate(this.rotation * -0.2); 
            }
            
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 15px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(meta.icon, 0, meta.isEmoji ? -1 : 0);
            ctx.restore();

        } else {
            // --- JUICY FLOATING NOTIFICATION TEXT ---
            ctx.translate(this.x, this.y + this.textYOffset);
            ctx.scale(this.textScale, this.textScale);
            ctx.globalAlpha = Math.max(0, this.textAlpha);
            
            // Text Drop Shadow / Outer Glow Simulation
            ctx.font = "bold 22px Inter, Impact, Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            
            ctx.strokeStyle = meta.bg;
            ctx.lineWidth = 5;
            ctx.strokeText(meta.label, 0, 0);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(meta.label, 0, 0);
            
            // Dynamic Accent underline bar
            ctx.strokeStyle = meta.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = meta.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(-50 * this.textAlpha, 16);
            ctx.lineTo(50 * this.textAlpha, 16);
            ctx.stroke();
        }

        ctx.restore();
    }

    collidesWith(bird) {
        if (this.collected) return false;
        const dx = bird.x - this.x;
        const dy = bird.y - this.y;
        
        // Account for varying sizes if tinyBird powerup is active
        const actualBirdRadius = (typeof birdScale !== "undefined" && birdScale < 1) ? game_config.birdRadius * 0.6 : game_config.birdRadius;
        const targetDist = actualBirdRadius + (this.size * 1.1);
        
        if ((dx * dx + dy * dy) < (targetDist * targetDist)) {
            this.collected = true; 
            return true;
        }
        return false;
    }
}

class Tree {
    constructor() {
        this.scale = 0.7 + Math.random() * 0.7;
        
        // Safety Fallback Guarding for global game metrics
        const groundH = (typeof game_config !== "undefined") ? game_config.groundHeight : 100;
        const curHeight = (typeof canvasHeight !== "undefined") ? canvasHeight : 600;
        const curWidth = (typeof canvasWidth !== "undefined") ? canvasWidth : 800;
        const baseSpeed = (typeof game_config !== "undefined") ? game_config.treeSpeed : 2.5;
        const ramp = (typeof game_config !== "undefined") ? game_config.difficultyRamp : 0.05;
        const curScore = (typeof score === "number") ? score : 0;

        this.y = curHeight - groundH + Math.min(Math.random() * 15, 15) - this.scale;
        this.x = curWidth + 60; // Extra buffer room to spawn smoothly off-screen
        
        this.speed = baseSpeed - (this.scale / 3.5) + Math.min(curScore * ramp, 1.2);
        this.width = 70 * this.scale; 
    }

    update(dt) {
        const deltaTime = dt || 16.67;
        const speedMult = (typeof gameSpeedMultiplier === "number") ? gameSpeedMultiplier : 1.0;
        this.x -= this.speed * speedMult * (deltaTime / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale); 
        ctx.shadowBlur = 0;

        // Trunk Layer
        ctx.fillStyle = '#5c3a21';
        ctx.beginPath();
        ctx.moveTo(-6, -25); ctx.lineTo(6, -25); ctx.lineTo(8, 0);
        ctx.quadraticCurveTo(12, 0, 14, 2); ctx.lineTo(-14, 2);
        ctx.quadraticCurveTo(-12, 0, -8, 0);
        ctx.closePath(); ctx.fill();

        // Bottom Leaves Layer
        ctx.fillStyle = '#143d31';
        ctx.beginPath();
        ctx.moveTo(-35, -20); ctx.quadraticCurveTo(0, -14, 35, -20); ctx.lineTo(0, -55);
        ctx.closePath(); ctx.fill();
        
        // Middle Leaves Layer
        ctx.fillStyle = '#1b5e43';
        ctx.beginPath();
        ctx.moveTo(-28, -45); ctx.quadraticCurveTo(0, -39, 28, -45); ctx.lineTo(0, -80);
        ctx.closePath(); ctx.fill();
        
        // Top Leaves Layer
        ctx.fillStyle = '#227d58';
        ctx.beginPath();
        ctx.moveTo(-20, -68); ctx.quadraticCurveTo(0, -63, 20, -68); ctx.lineTo(0, -102);
        ctx.closePath(); ctx.fill();

        ctx.restore();
    }
}

class Bush {
    constructor() {
        this.scale = 0.8 + Math.random() * 0.5;
        
        const groundH = (typeof game_config !== "undefined") ? game_config.groundHeight : 100;
        const curHeight = (typeof canvasHeight !== "undefined") ? canvasHeight : 600;
        const curWidth = (typeof canvasWidth !== "undefined") ? canvasWidth : 800;
        const baseSpeed = (typeof game_config !== "undefined") ? game_config.treeSpeed : 2.5;
        const ramp = (typeof game_config !== "undefined") ? game_config.difficultyRamp : 0.05;
        const curScore = (typeof score === "number") ? score : 0;

        this.y = curHeight - groundH + Math.min(Math.random() * 15, 15) - this.scale;
        this.x = curWidth + 40;
        this.speed = baseSpeed + Math.min(curScore * ramp, 1.0);
        
        this.width = 40 * this.scale;
        this.height = 20 * this.scale;
    }

    update(dt) {
        const deltaTime = dt || 16.67;
        const speedMult = (typeof gameSpeedMultiplier === "number") ? gameSpeedMultiplier : 1.0;
        this.x -= this.speed * speedMult * (deltaTime / 16.67);
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);
        
        ctx.fillStyle = 'rgba(15, 45, 20, 0.4)'; // Vector ground shadow representation
        ctx.beginPath();
        ctx.ellipse(0, 4, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main Bush Cluster Fills
        ctx.fillStyle = '#2a6e3a';
        ctx.beginPath();
        ctx.moveTo(-20, -15);
        ctx.quadraticCurveTo(-10, -25, 0, -20);
        ctx.quadraticCurveTo(10, -25, 20, -15);
        ctx.lineTo(20, 5); ctx.lineTo(-20, 5);
        ctx.closePath(); ctx.fill();
        
        // Layered Anime Style Inner Depth Textures
        ctx.fillStyle = '#1e5a2f';
        ctx.beginPath();
        ctx.arc(-8, -8, 5, 0, Math.PI * 2);
        ctx.arc(4, -12, 6, 0, Math.PI * 2);
        ctx.arc(8, -8, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    collidesWith(bird) {
        if (!bird) return false;
        // Fast square distance fallback lookup configurations
        const actualScale = (typeof birdScale !== "undefined") ? birdScale : 1.0;
        const baseRadius = (typeof game_config !== "undefined") ? game_config.birdRadius : 24;
        const br = baseRadius * actualScale;
        
        const bx = this.x + (this.width / 2);
        const by = this.y;
        const dx = bird.x - bx;
        const dy = bird.y - by;
        
        const checkRange = br + 20;
        return (dx * dx + dy * dy) < (checkRange * checkRange);
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
        if (!PIE_2) {
            const PIE_2 = Math.PI * 2;
        }
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.translate(this.x,this.y);
        ctx.scale(this.scale,this.scale);
        const g = ctx.createRadialGradient(25, 10, 5, 25, 10, 70);
        g.addColorStop(0, lerpColor('rgb(255,255,255)', 'rgb(134, 134, 189)' , 0.95, skyBrightness, 'oklch'));
        g.addColorStop(.5, lerpColor('rgb(255,255,255)', 'rgb(159, 157, 207)', 0.72, skyBrightness, 'oklch'));
        g.addColorStop(1, lerpColor('rgb(255, 255, 255)', 'rgb(134, 162, 197)',  0.18, skyBrightness, 'oklab'));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(-4,5,26,0, PIE_2);
        ctx.arc(19,-5,28,0, PIE_2);
        ctx.arc(50,-3,27,0, PIE_2);
        ctx.arc(74,7,28,0, PIE_2);
        ctx.arc(35,15,33,0, PIE_2);
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 5;
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
        this.speed = 0.01 + Math.random() * 0.02;
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
    if (!particles) return;
    if (!PIE_2) {
        const PIE_2 = Math.PI * 2;
    }
    const colorA = "#FFD93D", colorB = "#FFF8A5";

    for (let i = 0; i < 25; i++) {
        const angle = Math.random() * PIE_2;
        const speed = 2 + Math.random() * 5;
        
        // Caching pre-calculated velocity parameters inside local registers
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const particleColor = Math.random() > 0.5 ? colorA : colorB;
        const size = 2 + Math.random() * 4;
        const life = 35 + Math.random() * 25;

        // Pushes pre-calculated data points into the array instantly
        particles.push(
            new Particle(x, y, particleColor, size, vx, vy, life)
        );
    }
}

function drawPowerUpMeters() {
    if (typeof gameState === "undefined" || gameState !== Game_State.running) return;
    if (typeof powerUpTimers === "undefined" || typeof powerUpsState === "undefined") return;

    let y = 48; 
    const w = 190, h = 16, pad = 15; 

    const styles = {
        shield:      { txt: "SHIELD",      ico: "🛡️", cA: "#ff5ca8", cB: "#bc1360", max: 480, isBar: true },
        magnet:      { txt: "MAGNET",      ico: "🧲", cA: "#ff4040", cB: "#9e0c0c", max: 600, isBar: true },
        doubleScore: { txt: "SCORE x2",    ico: "⭐", cA: "#ffd93d", cB: "#b2920c", max: 600, isBar: true },
        doubleCoin:  { txt: "COINS x2",    ico: "🪙", cA: "#fffd90", cB: "#bcae13", max: 900, isBar: true },
        tinyBird:    { txt: "TINY BIRD",   ico: "⬇️", cA: "#55ff99", cB: "#099a43", max: 600, isBar: true },
        slowMotion:  { txt: "SLOW-MO",     ico: "❄️", cA: "#5ac8ff", cB: "#0b6fa0", max: 720, isBar: true },
        dash:        { txt: "WARP DASH",   ico: "⚡", cA: "#8d5cff", cB: "#4915bc", max: 480, isBar: true },
        laser:       { txt: "OMEGA LASER", ico: "💥", cA: "#ff003c", cB: "#96001e", max: 360, isBar: true }, 
        gravityFlip: { txt: "GRAVITY FLIP",ico: "🔄", cA: "#00ffcc", cB: "#00997a", max: 480, isBar: true },
        shadowClone: { txt: "CLONE TEAM",  ico: "👥", cA: "#bd00ff", cB: "#630084", max: 720, isBar: true },
        phoenix:     { txt: "PHOENIX CORE",ico: "🔥", cA: "#ff7b00", cB: "#963a00", max: 1,   isBar: false }
    };

    try {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Lock directly to screen space bounds
        ctx.shadowBlur = 0; // Lock hardware acceleration pipelines on

        const fCount = (typeof frameCount === "number") ? frameCount : 0;
        const activeStateKeys = Object.keys(powerUpsState);

        for (let i = 0; i < activeStateKeys.length; i++) {
            const key = activeStateKeys[i];
            if (!powerUpsState[key]) continue; 
            
            const s = styles[key];
            if (!s) continue;

            const time = powerUpTimers[key] || 0;
            const isLow = s.isBar && time < 120; // 120 frames = Under 2 seconds remaining
            
            // High-performance bitwise layout flashing calculation
            const isFlashingFrame = isLow && ((fCount >> 2) & 1);

            // STYLE PATH A: TIMED PROGRESS BAR LAYOUT (`isBar === true`)
            if (s.isBar) {
                if (time <= 0) continue; 
                
                const fillW = w * (time / s.max);
                const secStr = (time / 60).toFixed(1) + "s"; 

                ctx.textBaseline = "bottom";

                // A. EXTRA VISIBLE DATA HEADERS (Drawn entirely above the bar area)
                // Large Icon Symbol
                ctx.font = "24px sans-serif"; 
                ctx.textAlign = "left";
                ctx.fillStyle = "#ffffff";
                ctx.fillText(s.ico, pad, y - 4);

                // Bold White Label Text
                ctx.font = "bold 15px 'Impact', 'Arial Black', sans-serif";
                ctx.letterSpacing = '0.8px';
                ctx.fillText(s.txt, pad + 32, y - 6);

                // High-Contrast Digital Timer (Turns red and flashes if low)
                ctx.fillStyle = isFlashingFrame ? "#ff1a26" : s.cA;
                ctx.font = "900 16px monospace"; 
                ctx.textAlign = "right";
                ctx.fillText(secStr, pad + w, y - 6);

                // B. SLANTED TECH TRAY BACKGROUND
                ctx.fillStyle = "rgba(5, 9, 20, 0.88)"; // Ultra deep glass tray provides solid backing contrast
                ctx.strokeStyle = "rgba(255, 255, 255, 0.16)"; 
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(pad, y); ctx.lineTo(pad + w, y);
                ctx.lineTo(pad + w + 5, y + h); ctx.lineTo(pad + 5, y + h);
                ctx.closePath(); ctx.fill(); ctx.stroke();

                // C. 3-STAGE PLASMA FILL (With dynamic end-flicker alerts)
                if (fillW > 2) {
                    ctx.save();
                    const grad = ctx.createLinearGradient(pad, 0, pad + w, 0);
                    
                    // 🚀 CRITICAL FLICKER: If time is low, swap the standard theme colors 
                    // for an intense, flashing red emergency danger bar signature
                    if (isFlashingFrame) {
                        grad.addColorStop(0, "#7a0012");
                        grad.addColorStop(1, "#ff1a35");
                    } else {
                        grad.addColorStop(0, s.cB); 
                        grad.addColorStop(1, s.cA);
                    }
                    
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.moveTo(pad, y); ctx.lineTo(pad + fillW, y);
                    ctx.lineTo(pad + 5 + fillW, y + h); ctx.lineTo(pad + 5, y + h);
                    ctx.closePath(); ctx.fill();

                    // Crisp wireframe outline tracking line matches the warning state
                    ctx.strokeStyle = isFlashingFrame ? "#ff1a35" : s.cA;
                    ctx.lineWidth = 1.5; ctx.stroke();
                    
                    // Core glass tubing reflection shine accent bar
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(pad + 1, y + 2); ctx.lineTo(pad + fillW - 1, y + 2); ctx.stroke();
                    ctx.restore();
                }

                // D. SCI-FI HUD BRACKET ACCENT
                ctx.strokeStyle = isFlashingFrame ? "#ff1a35" : "rgba(255,255,255,0.25)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(pad - 6, y - 3); ctx.lineTo(pad - 6, y + h + 2); ctx.lineTo(pad + 2, y + h + 2);
                ctx.stroke();

                y += 59; // Uniform layout gap vertical drop
            } 
            // STYLE PATH B: INFINITE OR TOGGLE TOKEN BADGE (`isBar === false`)
            else {
                ctx.save();
                const badgeSize = 32;
                const pulseRadius = Math.sin(fCount * 0.08) * 3;

                ctx.fillStyle = "rgba(4, 8, 18, 0.88)";
                ctx.strokeStyle = s.cA;
                ctx.lineWidth = 2;
                
                ctx.beginPath();
                ctx.moveTo(pad + 12, y - 10);
                ctx.lineTo(pad + badgeSize + 12, y - 10);
                ctx.lineTo(pad + badgeSize + 22, y + (badgeSize / 2) - 10);
                ctx.lineTo(pad + badgeSize + 12, y + badgeSize - 10);
                ctx.lineTo(pad + 12, y + badgeSize - 10);
                ctx.lineTo(pad + 2, y + (badgeSize / 2) - 10);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.font = (22 + pulseRadius) + "px sans-serif"; 
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(s.ico, pad + (badgeSize / 2) + 12, y + (badgeSize / 2) - 10);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 15px 'Impact', sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(s.txt, pad + badgeSize + 28, y + (badgeSize / 2) - 12);

                ctx.fillStyle = s.cA;
                ctx.font = "900 13px monospace";
                ctx.fillText("ACTIVE", pad + badgeSize + 28, y + (badgeSize / 2) + 4);

                ctx.restore();
                y += 56; 
            }
        }
    } catch (hudError) {
        console.warn("HUD execution safety system bypass invoked:", hudError);
    } finally {
        ctx.restore();
    }
}

class DrawGame {
    constructor() {
        this.glowCircleCount = 18;
        this.waveCount = 5;
        this.sparkleCount = 90;
        this.auroraCount = 25;

        this.cachedSkyGrad = null;
        this.lastCachedFrame = -100; 
    }

    drawBackground() {
        const currentFrame = (typeof frameCount === "number") ? frameCount : 0;
        const curW = (typeof canvasWidth === "number") ? canvasWidth : 800;
        const curH = (typeof canvasHeight === "number") ? canvasHeight : 600;

        // Recalculate color spectrum once a second to maximize frame rates
        if (!this.cachedSkyGrad || (currentFrame - this.lastCachedFrame > 60)) {
            const sky = ctx.createLinearGradient(0, 0, 0, curH);
            
            // Your exact original bright sky colors with proper alpha tags
            sky.addColorStop(0.0, typeof lerpColor === "function" ? lerpColor("#2d56d9", "#04070f", 1, skyBrightness, 'oklch') : "#04070f");
            sky.addColorStop(0.25, typeof lerpColor === "function" ? lerpColor("#4b7dff", "#0d1447", 1, skyBrightness, 'oklch') : "#0d1447");
            sky.addColorStop(0.55, typeof lerpColor === "function" ? lerpColor("#69d8ff", "#18327d", 1, skyBrightness, 'oklch') : "#18327d");
            sky.addColorStop(0.80, typeof lerpColor === "function" ? lerpColor("#ffe5ac", "#4361c7", 1, skyBrightness, 'oklch') : "#4361c7");
            sky.addColorStop(1.0, typeof lerpColor === "function" ? lerpColor("#72eed3", "#ff9450", 1, skyBrightness, 'oklch') : "#ff9450");
            
            this.cachedSkyGrad = sky;
            this.lastCachedFrame = currentFrame;
        }

        ctx.fillStyle = this.cachedSkyGrad;
        ctx.fillRect(0, 0, curW, curH);

        // 2. Floating Glow Circles
        ctx.fillStyle = "rgba(108, 189, 255, 0.04)";
        for (let i = 0; i < this.glowCircleCount; i++) {
            const x = (currentFrame * 0.15 + i * 130) % (curW + 100) - 50;
            const y = 70 + Math.sin(currentFrame * 0.01 + i) * 35 + i * 10;
            ctx.beginPath();
            ctx.arc(x, y, 18, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 3. Atmospheric Waves Layer
        const waveBaseY = 120;
        ctx.save();
        // 🚀 THE SMOOTHING FIX: Set a single base color once, and use globalAlpha 
        // to control the opacity levels. This completely stops memory thrashing!
        ctx.fillStyle = "rgb(42, 142, 172)"; 
        
        for (let i = 0; i < this.waveCount; i++) {
            ctx.globalAlpha = 0.06 + i / 120; // Blazing fast math variable adjustment
            const y = waveBaseY + i * 75 + Math.sin(currentFrame * 0.007 + i) * 10;
            
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(curW * 0.2, y - 25, curW * 0.4, y + 30, curW * 0.6, y);
            ctx.bezierCurveTo(curW * 0.8, y - 30, curW, y + 20, curW, y + 60);
            ctx.lineTo(curW, curH);
            ctx.lineTo(0, curH);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // 4. Horizon Glow Panel
        const horizon = ctx.createLinearGradient(0, curH * 0.45, 0, curH);
        horizon.addColorStop(0, "rgba(255,255,255,0)");
        horizon.addColorStop(0.5, "rgba(255,255,255,0.05)");
        horizon.addColorStop(1, "rgba(180,255,255,0.15)");
        ctx.fillStyle = horizon;
        ctx.fillRect(0, 0, curW, curH);

        // 5. Star Sparkles
        for (let i = 0; i < this.sparkleCount; i++) {
            const x = (i * 91) % curW;
            const y = (i * 37) % 330;
            const pulse = 0.25 + 0.75 * Math.sin(currentFrame * 0.02 + i);
            ctx.fillStyle = "rgba(255,255,255," + (0.15 * pulse) + ")";
            ctx.fillRect(x, y, 2, 2);
        }

        this.drawSunAndMoon();

        // 6. Aurora Wind Streams (High-Speed Path Architecture)
        ctx.save();
        ctx.lineCap = "round"; 
        
        for (let i = 0; i < this.auroraCount; i++) {
            const speed = 1 + Math.sin(i * 17.3) * 0.4 + 1.5;
            const length = 60 + (Math.sin(i * 9.7) + 1) * 50;
            const x = curW + length - ((currentFrame * speed + i * 145) % (curW + length * 2));
            const y = 40 + i * 22 + Math.sin(currentFrame * 0.015 + i * 0.8) * 12;
            const curve = Math.sin(currentFrame * 0.05 + i) * 8;

            ctx.strokeStyle = "rgba(255, 255, 255, " + (0.18 + (i % 3) * 0.08) + ")";
            ctx.lineWidth = 1 + (i % 3);
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x - length * 0.3, y + curve, x - length * 0.7, y - curve, x - length, y);
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - skyBrightness));
        if (typeof stars !== "undefined" && Array.isArray(stars)) {
            stars.forEach(star => { if(star.draw) star.draw(); });
        }
        ctx.restore();

        if (typeof clouds !== "undefined" && Array.isArray(clouds)) {
            clouds.forEach(cloud => { if(cloud.draw) cloud.draw(); });
        }
        
        // 7. Warp Velocity Overlay
        if (typeof powerUpsState !== "undefined" && powerUpsState.dash) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.44)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < 35; i++) {
                const x = Math.random() * curW;
                const y = Math.random() * curH;
                ctx.moveTo(x, y);
                ctx.lineTo(x - 50, y);
            }
            ctx.stroke(); 
            ctx.restore();
        }
    }

    drawSunAndMoon() {
        const currentWorldTime = (typeof worldTime === "number") ? worldTime : 0;
        const currentDayLength = (typeof DAY_LENGTH === "number") ? DAY_LENGTH : 50000;
        const curW = (typeof canvasWidth === "number") ? canvasWidth : 800;
        const curH = (typeof canvasHeight === "number") ? canvasHeight : 600;
        
        const t = currentWorldTime / currentDayLength;
        const angle = t * Math.PI * 2 - Math.PI;
        const radius = 360;
        const cx = curW / 2 + curW / 4;
        const cy = curH / 6 * 3.5;
        
        const sunX = cx + Math.cos(angle) * radius;
        const sunY = cy + Math.sin(angle) * radius;
        const moonX = cx + Math.cos(angle + Math.PI) * radius;
        const moonY = cy + Math.sin(angle + Math.PI) * radius;

        // Sun
        ctx.save();
        ctx.shadowColor = "#ffe66d";
        ctx.shadowBlur = skyBrightness > 0.1 ? 60 : 0; 
        
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 90);
        sunGlow.addColorStop(0, "#ffe18e");
        sunGlow.addColorStop(0.25, "rgba(255, 242, 140, 0.77)");
        sunGlow.addColorStop(0.7, "rgba(255, 202, 58, 0.56)");
        sunGlow.addColorStop(1, "rgba(255, 202, 58, 0)");
        
        ctx.fillStyle = sunGlow;
        ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, Math.PI * 2); ctx.fill();
        
        ctx.fillStyle = "#ffe27a";
        ctx.shadowColor = "rgba(236, 167, 76, 0.82)";
        ctx.shadowBlur = skyBrightness > 0.1 ? 20 : 0;
        ctx.beginPath(); ctx.arc(sunX, sunY, 38, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Moon
        ctx.save();
        ctx.translate(moonX, moonY);
        ctx.rotate(0.35);

        const moonR = 27;
        ctx.shadowBlur = 0; 
        
        const moonGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, moonR * 2.2);
        moonGlow.addColorStop(0, "rgba(200, 225, 255, 0.4)");   
        moonGlow.addColorStop(0.3, "rgba(140, 185, 255, 0.15)"); 
        moonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");           
        
        ctx.fillStyle = moonGlow;
        ctx.beginPath(); ctx.arc(0, 0, moonR * 2.2, 0, Math.PI * 2); ctx.fill();
        
        const moonGrad = ctx.createLinearGradient(-moonR, -moonR, moonR, moonR);
        moonGrad.addColorStop(0, "#ffffff");   
        moonGrad.addColorStop(0.6, "#f5f9ff"); 
        moonGrad.addColorStop(1, "#b5ceff");   
        ctx.fillStyle = moonGrad;

        ctx.beginPath();
        ctx.arc(0, 0, moonR, -Math.PI / 2, Math.PI / 2, false);
        ctx.quadraticCurveTo(moonR * 0.45, 0, 0, -moonR);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        ctx.shadowBlur = 0; 
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
    const deltaTime = dt || 16.67;
    const currentDayLength = (typeof DAY_LENGTH === "number") ? DAY_LENGTH : 50000;
    
    worldTime += deltaTime;
    if (worldTime >= currentDayLength) {
        worldTime = 0;
    }
    
    // Smooth parametric evaluation curve for time cycles
    skyBrightness = (Math.sin((worldTime * Math.PI * 2) / currentDayLength - Math.PI / 2) + 1) / 2;
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
    if (typeof triggerScreenShake === "function") triggerScreenShake(12);

    switch(type) {
        case "shield":
            powerUpsState.shield = true;
            powerUpTimers.shield = 15 * 60;
            break;
        case "magnet":
            powerUpsState.magnet = true;
            powerUpTimers.magnet = 10 * 60;
            break;
        case "doubleScore":
            powerUpsState.doubleScore = true;
            powerUpTimers.doubleScore = 10 * 60;
            break;
        case "doubleCoin":
            powerUpsState.doubleCoin = true;
            powerUpTimers.doubleCoin = 15 * 60;
            break;
        case "tinyBird":
            powerUpsState.tinyBird = true;
            powerUpTimers.tinyBird = 10 * 60;
            break;
        case "slowMotion":
            powerUpsState.slowMotion = true;
            powerUpTimers.slowMotion = 12 * 60;
            break;
        case "dash":
            powerUpsState.dash = true;
            powerUpTimers.dash = 8 * 60;
            break;
        case "phoenix": 
            powerUpsState.phoenix = true; 
            break;
        case "laser":
            powerUpsState.laser = true;
            powerUpTimers.laser = 8 * 60; // 6 seconds of pipe destruction
            break;
        case "gravityFlip":
            powerUpsState.gravityFlip = true;
            powerUpTimers.gravityFlip = 8 * 60; // 8 seconds of upside down flying
            break;
        case "shadowClone":
            powerUpsState.shadowClone = true;
            powerUpTimers.shadowClone = 12 * 60; // 12 seconds of invulnerable sidekick birds
            // Instantiates clone helper tracking values
            bird.clones = [
                { yOffset: -50, phase: 0, alpha: 0 },
                { yOffset: 50,  phase: Math.PI, alpha: 0 }
            ];
            break;
        case "coinBlast":
            if (typeof coins !== "undefined") {
                coins.forEach(coin => {
                    coin.speed = game_config.pipeSpeed * 3; // Speeds them up dramatically
                    // Artificially trip distance triggers
                    coin.angle = 0; 
                });
            }
            // Triggers a custom screen notification without holding state
            powerUpsState.coinBlast = true;
            setTimeout(() => { powerUpsState.coinBlast = false; }, 1000);
            break;
    }
    
    evaluateGameSpeed();
}

function updatePowerUps() {
    // Tick down active timers safely
    Object.keys(powerUpTimers).forEach(key => {
        if (powerUpTimers[key] > 0) {
            powerUpTimers[key] -= 1;
            
            // FIX 1: Trigger expiration exactly when the frame countdown hits 0
            if (powerUpTimers[key] === 0) {
                powerUpsState[key] = false; // Turn state flag off completely
                
                // Specific cleanup for Gravity Flip
                if (key === "gravityFlip" && bird.gravity < 0) {
                    bird.gravity = Math.abs(bird.gravity);
                }

                // FIX 2: Specific absolute cleanup for Shadow Clones to make them disappear
                if (key === "shadowClone") {
                    delete bird.clones; // Completely deletes the array so drawing stops immediately
                }
            }
        }
    });

    // Handle Size scaling priorities cleanly
    if (powerUpsState.tinyBird) {
        birdScale = 0.55;
    } else if (powerUpsState.slowMotion) {
        birdScale = 0.95;
    } else {
        birdScale = 1.0;
    }

    // Dynamic horizontal positional easing
    const targetX = powerUpsState.dash ? canvasWidth * 0.275 : canvasWidth * 0.22;
    bird.x += (targetX - bird.x) * 0.1;

    // LASER PHYSICS & OBSTACLE VAPORIZATION LOOP
    if (powerUpsState.laser && typeof pipes !== "undefined") {
        pipes.forEach(pipe => {
            // Target checks active pipes floating inside the projection path forward
            if (!pipe.passed && pipe.x > bird.x && pipe.x < bird.x + 350) {
                if (typeof screenShake === "function") screenShake(5);
                if (typeof particles !== "undefined") {
                    for (let i = 0; i < 8; i++) {
                        particles.push({
                            x: pipe.x + (Math.random() - 0.5) * (pipe.width || 40),
                            y: bird.y + (Math.random() - 0.5) * 30,
                            vx: (Math.random() - 0.5) * 4 - 2,
                            vy: (Math.random() - 0.5) * 6 - 2,
                            size: Math.random() * 5 + 3,
                            life: 40,
                            maxLife: 40,
                            color: Math.random() < 0.5 ? "#ff5500" : "#ffaa00",
                            update: function() {
                                this.x += this.vx; this.y += this.vy;
                                this.life--;
                            },
                            draw: function() {
                                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                                ctx.globalAlpha = this.life / this.maxLife;
                                ctx.fillStyle = this.color;
                                // Draw a jagged burning shard instead of a clean circle
                                ctx.fillRect(this.x, this.y, this.size, this.size);
                                ctx.restore();
                            }
                        });
                    }
                }

                // Vaporize obstacle and register score points cleanly
                pipe.x = -600; 
                pipe.passed = true; 
                score += 1; 
                bestScore = Math.max(bestScore, score);
                if (typeof updateHud === "function") updateHud();
            }
        });
    }

    // CLONE FUNCTIONAL MECHANICS (FIXED EXPIRATION)
    if (powerUpsState.shadowClone && powerUpTimers.shadowClone > 0 && bird.clones) {
        bird.clones.forEach(clone => {
            clone.phase += 0.08; 
            clone.alpha = Math.min(0.6, clone.alpha + 0.05);

            const cloneWave = Math.sin(clone.phase) * 8;
            const globalCloneX = bird.x - 25;
            const globalCloneY = bird.y + clone.yOffset + cloneWave;

            if (typeof coins !== "undefined") {
                coins.forEach(coin => {
                    if (!coin.collected) {
                        const dx = globalCloneX - coin.x;
                        const dy = globalCloneY - coin.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < 140) { // Attraction zone radius
                            const pull = (140 - dist) * 0.08;
                            coin.x += (dx / dist) * pull;
                            coin.y += (dy / dist) * pull;

                            // Direct contact capture check
                            const collectDist = game_config.birdRadius + 12;
                            if (dist < collectDist) {
                                coin.collected = true;
                                coinCount += powerUpsState.doubleCoin ? 2 : 1;
                                if (typeof createCoinExplosion === "function") createCoinExplosion(coin.x, coin.y);
                                if (typeof screenShake === "function") screenShake(2);
                                if (typeof updateHud === "function") updateHud();
                                if (typeof saveStoredStats === "function") saveStoredStats();
                            }
                        }
                    }
                });
            }
        });
    }
    evaluateGameSpeed();
}

function evaluateGameSpeed() {
    if (powerUpsState.dash) {
        gameSpeedMultiplier = 2.0;
    } else if (powerUpsState.slowMotion) {
        gameSpeedMultiplier = 0.55;
    } else {
        gameSpeedMultiplier = 1.0;
    }
}

function revivePlayer() {
    powerUpsState.phoenix = false;
    bird.y = canvasHeight / 2;
    bird.velocity = 0;
    bird.x = canvasWidth * 0.22;
    
    if (typeof bird.jump === "function") bird.jump();
    if (typeof screenShake === "function") screenShake(25); // Huge blast wave effect

    // Vaporize obstacles instantly within proximity zones to clear path safely
    pipes = pipes.filter(pipe => pipe.x > bird.x + 220);
    bushes = bushes.filter(bush => bush.x > bird.x + 180);
    coins = coins.filter(coin => coin.x > bird.x + 120);
    powerUps = powerUps.filter(p => p.x > bird.x + 120);
}

function spawnObjects() {
    if (typeof gameState === "undefined" || gameState !== Game_State.running || !frameCount) return;

    try {
        // Cache configuration lookups locally to speed up execution
        const config = (typeof game_config !== "undefined") ? game_config : { difficultyRamp: 0.05, maxPipes: 4, groundHeight: 100 };
        const rates = (typeof Spawn_Rates !== "undefined") ? Spawn_Rates : { pipeSpawnRate: 120, treeSpawnRate: 90, coinSpawnRate: 80 };
        
        const difficulty = (typeof score === "number") ? score * config.difficultyRamp : 0;
        const curCanvasHeight = (typeof canvasHeight === "number") ? canvasHeight : 600;
        const curCanvasWidth = (typeof canvasWidth === "number") ? canvasWidth : 800;

        if (lastPipeTime === 0) lastPipeTime = frameCount;
        if (lastTreeTime === 0) lastTreeTime = frameCount;
        if (lastBushTime === 0) lastBushTime = frameCount;
        if (lastCoinTime === 0) lastCoinTime = frameCount;
        if (lastPowerUpTime === 0) lastPowerUpTime = frameCount;
        
        const pipeInterval = Math.max(15, rates.pipeSpawnRate - Math.min(difficulty, 18));
        if (frameCount - lastPipeTime > pipeInterval) {
            pipes.push(new Pipe());
            lastPipeTime = frameCount;
        }

        // Clean arrays cleanly from left edge without heavy array rebuilding slicing loops
        const maxPipesLimit = config.maxPipes || 4;
        if (pipes.length > maxPipesLimit) {
            pipes.shift(); // Much faster than splice() for deleting individual items from front
        }

        const treeInterval = Math.max(20, rates.treeSpawnRate - Math.min(difficulty, 16) * 0.25);
        if (frameCount - lastTreeTime > treeInterval) {
            trees.push(new Tree());
            lastTreeTime = frameCount;
        }

        const bushInterval = Math.max(20, (rates.treeSpawnRate || rates.bushSpawnRate || 90) + 26 - Math.min(difficulty, 14));
        if (frameCount - lastBushTime > bushInterval) {
            bushes.push(new Bush());
            lastBushTime = frameCount;
        }

        const minY = 100;
        const maxY = Math.max(120, curCanvasHeight - config.groundHeight - 100);
        const spawnX = curCanvasWidth + 40;

        const coinInterval = Math.max(15, rates.coinSpawnRate + 6 - Math.min(difficulty, 6));
        if (frameCount - lastCoinTime > coinInterval) {
            if (coins.length < 25) { // Hard limit prevents array explosion memory bloat
                coins.push(new Coin(spawnX, minY + Math.random() * (maxY - minY)));
            }
            lastCoinTime = frameCount;
        }
        
        const pwrInterval = (rates.coinSpawnRate || 80) * 3;
        if (frameCount - lastPowerUpTime > pwrInterval) {
            powerUps.push(new PowerUp(spawnX, minY + Math.random() * (maxY - minY)));
            lastPowerUpTime = frameCount; // Reset timer even if random check fails to distribute items evenly
        }

        if (typeof powerUpsState !== "undefined" && powerUpsState.dash && typeof spawnDashParticle === "function") {
            spawnDashParticle();
        }

    } catch (spawnError) {
        console.warn("Spawning recovery protocol triggered:", spawnError);
        // Force sync counter trackers forward to break out of loop lock calculations
        lastPipeTime = frameCount;
        lastTreeTime = frameCount;
        lastBushTime = frameCount;
        lastCoinTime = frameCount;
        lastPowerUpTime = frameCount;
    }
}

function updateGameObjects(dt) {
    if (typeof gameState === "undefined" || gameState !== Game_State.running) return;
    try {
        const deltaTime = dt || 16.67;
        if (lastFrameTime === 0) lastFrameTime = deltaTime;

        const birdX = bird ? bird.x : 0;
        const birdY = bird ? bird.y : 0;
        const isMagnetActive = typeof powerUpsState !== "undefined" && powerUpsState.magnet;

        if (bird && typeof bird.update === "function") bird.update(deltaTime);

        // Background decorative layers require minimal boundary checks
        if (Array.isArray(stars)) stars.forEach(star => star.update && star.update());
        if (Array.isArray(clouds)) clouds.forEach(cloud => cloud.update && cloud.update(deltaTime));

        // Scenery: Trees Layer
        if (Array.isArray(trees)) {
            for (let i = trees.length - 1; i >= 0; i--) {
                const tree = trees[i];
                if (tree.update) tree.update(deltaTime);
                
                // If a tree rolls fully off the left edge, pop it immediately to save CPU cycles
                if (tree.x + (tree.width || 60) < -50) {
                    trees.splice(i, 1);
                }
            }
        }

        if (Array.isArray(bushes)) {
            for (let i = bushes.length - 1; i >= 0; i--) {
                const bush = bushes[i];
                if (bush.update) bush.update(deltaTime);
                if (bush.x + (bush.width || 50) < -50) {
                    bushes.splice(i, 1);
                }
            }
        }

        if (Array.isArray(pipes)) {
            for (let i = pipes.length - 1; i >= 0; i--) {
                const pipe = pipes[i];
                if (pipe.update) pipe.update(deltaTime);
                
                // Keep the array light. Splice any pipes that traveled past visibility boundaries
                if (pipe.x + (pipe.width || 78) < -60) {
                    pipes.splice(i, 1);
                }
            }
        }

        if (Array.isArray(coins)) {
            for (let i = coins.length - 1; i >= 0; i--) {
                const coin = coins[i];
                if (coin.update) coin.update(deltaTime);

                if (coin.collected || coin.x + 30 < -40) {
                    coins.splice(i, 1);
                    continue;
                }

                if (isMagnetActive) {
                    const dx = birdX - coin.x;
                    const dy = birdY - coin.y;
                    
                    const distSq = dx * dx + dy * dy;
                    if (distSq < 28900) { // 28900 is exactly 170 * 170 squared
                        coin.x += dx * 0.08;
                        coin.y += dy * 0.08;
                    }
                }
            }
        }

        if (Array.isArray(powerUps)) {
            for (let i = powerUps.length - 1; i >= 0; i--) {
                const pu = powerUps[i];
                if (pu.update) pu.update(deltaTime);
                
                if (pu.collected || pu.x + 30 < -40) {
                    powerUps.splice(i, 1);
                }
            }
        }

    } catch (updateError) {
        console.warn("High-speed game object manager bypassed an internal update exception safely:", updateError);
    }
}


function initGame({ jumpImmediately = true } = {}) {
    try {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        bird = new Bird();
        pipes = [];
        trees = [];
        bushes = [];
        coins = [];
        powerUps = [];
        particles = [];

        // 3. Fallback checks for display metrics
        const curW = (typeof canvasWidth === "number" && canvasWidth > 0) ? canvasWidth : 800;
        const baseW = (typeof BASE_WIDTH === "number") ? BASE_WIDTH : 800;
        
        const isMobile = curW < 768;
        clouds = Array.from({ length: isMobile ? 4 : 6 }, () => new Cloud());
        const starCount = Math.max(36, Math.min(70, Math.round((curW / baseW) * 70)));
        stars = Array.from({ length: starCount }, () => new Star());

        frameCount = 0;
        score = 0;
        flashTimer = 0;
        lastFrameTime = 0;
        lastPipeTime = 0;
        lastCoinTime = 0;
        lastTreeTime = 0;
        lastBushTime = 0;
        lastPowerUpTime = 0;

        // 5. Safe DOM Interface resets
        if (typeof scoreEl !== "undefined" && scoreEl) scoreEl.textContent = "0";
        if (typeof startOverlay !== "undefined" && startOverlay) startOverlay.classList.remove('visible');
        if (typeof gameOverOverlay !== "undefined" && gameOverOverlay) gameOverOverlay.classList.remove('visible');

        gameState = Game_State.running; 
        if (typeof updateHud === "function") updateHud();
        if (jumpImmediately && bird && typeof bird.jump === "function") {
            bird.jump();
        }

        animationFrameId = requestAnimationFrame(gameLoop);
    } catch (initError) {
        console.error("Critical Failure during Game Initialization Sequence:", initError);
        gameState = Game_State.start;
        if (typeof startOverlay !== "undefined" && startOverlay) startOverlay.classList.add('visible');
    }
}

function endGame() {
    try {
        if (gameState === Game_State.start) return;
        // Secure metrics against unexpected NaN errors
        const rawBest = (typeof bestScore === "number" && Number.isFinite(bestScore)) ? bestScore : 0;
        const curScore = (typeof score === "number" && Number.isFinite(score)) ? score : 0;
        const curCoins = (typeof coinCount === "number" && Number.isFinite(coinCount)) ? coinCount : 0;

        bestScore = Math.max(rawBest, curScore);
        gameState = Game_State.game_over;

        if (typeof saveStoredStats === "function") saveStoredStats();
        if (typeof updateHud === "function") updateHud();
        
        // Accurate record-breaking detection string
        const isNewBest = curScore > rawBest && curScore > 0;
        const bestLabel = isNewBest ? '🏆 NEW BEST!' : `Best: ${bestScore}`;
        
        if (typeof finalMessage !== "undefined" && finalMessage) {
            finalMessage.textContent = `Score: ${curScore} · ${bestLabel} · Coins: ${curCoins}`;
        }
        
        if (typeof gameOverOverlay !== "undefined" && gameOverOverlay) {
            gameOverOverlay.classList.add('visible');
        }

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

    } catch (endError) {
        console.error("Critical Failure during End Game Sequence:", endError);
    }
}

function gameLoop(timestamp) {
    const gameRenderer = new DrawGame();
    try {
        ctx.save();
        // Handle first frame initialization cleanly
        if (!lastFrameTime) lastFrameTime = timestamp;
        const dt = Math.min(timestamp - lastFrameTime, 32);
        lastFrameTime = timestamp;

        switch (gameState) {
            case Game_State.start:
                loadStoredStats();
                break;

            case Game_State.running:
                frameCount += 1;
                ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                updateWorldTime(dt);
                if (typeof gameRenderer.drawBackground === "function") {
                    gameRenderer.drawBackground();
                }
                drawGround();
                updateGameObjects(dt);
                updatePowerUps();
                spawnObjects();

                pipes = pipes.filter(pipe => pipe.x + pipe.width > -20);
                coins = coins.filter(coin => !coin.isDead && coin.x > -50);
                bushes = bushes.filter(bush => bush.x + bush.width > -20);
                powerUps = powerUps.filter(pu => !pu.isDead && pu.x + pu.size > -20);
                particles = particles.filter(p => p.life > 0);
                trees = trees.filter(tree => tree.x + 80 > -20);

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
                        score += powerUpsState.doubleScore ? 2 : 1;
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
                        coinCount += powerUpsState.doubleCoin ? 2 : 1;
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

                drawDashTrail();
                drawRainbowTrail();
                
                particles.forEach(p => {
                    p.update(); 
                    p.draw();
                });

                // 6. Render Active Player & Overlays
                bird.draw(); 
                drawPowerUpMeters();

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
        console.error('Error in game loop:', error);
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