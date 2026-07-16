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
let coinCount = 0;
let bestScore = 0;

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
    pipeSpawnRate: 80,
    coinSpawnRate: 90,
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
        this.x = canvasWidth + this.width;
        this.top = 65 + Math.random() * 250;
        this.bottom = this.top + game_config.pipeGap;
        this.passed = false;
        this.speed = game_config.pipeSpeed + Math.min(score * game_config.difficultyRamp, 1.2) * 0.5;
        this.topHeight = this.top;
        this.bottomY = this.bottom;
        this.bottomHeight = canvasHeight - this.bottomY;
        this.capHeight = 26; // Snug vertical balance
        this.capOffset = 5;  // Slightly wider brim for cleaner contrast
        
        // Internal pulse timing tracker for the animated glow streaks
        this.glowPulse = Math.random() * Math.PI;
    }

    update(dt) {
        const deltaTime = dt || 16.67;
        const timeFactor = deltaTime / 16.67;
        
        this.x -= this.speed * gameSpeedMultiplier * timeFactor;
        this.glowPulse += 0.05 * timeFactor; // Animates neon lights
    }

    draw() {
        const colors = [
            '#1c9c34', 
            '#28eb59', 
            '#4eeb75', 
            '#1bd148', 
            '#0f7d2a'
        ];
        ctx.save();

        // 1. MAIN METALLIC GRADIENT CONFIGURATION
        // Ensures your input colors look completely 3D by building a specular cylindrical sheen maps
        const getPipeGradient = (startX, endX) => {
            const grad = ctx.createLinearGradient(startX, 0, endX, 0);
            grad.addColorStop(0.0, colors[0] || '#112233'); // Dark left edge
            grad.addColorStop(0.2, colors[1] || '#224466'); // Base body
            grad.addColorStop(0.5, colors[2] || '#44aaee'); // Specular center core highlight
            grad.addColorStop(0.8, colors[3] || '#1c5588'); // Secondary midtone
            grad.addColorStop(1.0, colors[4] || '#0b1b2b'); // Deep right shadow
            return grad;
        };

        const pipeGrad = getPipeGradient(this.x, this.x + this.width);
        const capGrad = getPipeGradient(this.x - this.capOffset, this.x + this.width + this.capOffset);

        // 2. LAYER 1: AMBIENT OUTER BLUR GLOW
        ctx.shadowColor = 'rgba(69, 118, 255, 0.5)';
        ctx.shadowBlur = 18;

        // 3. LAYER 2: SHARP STROKING AND BASE STRUCTURAL FILLS
        // Top Main Body
        ctx.fillStyle = pipeGrad;
        ctx.fillRect(this.x, 0, this.width, this.topHeight - this.capHeight);
        
        // Bottom Main Body
        ctx.fillRect(this.x, this.bottomY + this.capHeight, this.width, this.bottomHeight - this.capHeight);

        // Render Flanged Rim Caps
        ctx.fillStyle = capGrad;
        ctx.fillRect(this.x - this.capOffset, this.topHeight - this.capHeight, this.width + this.capOffset * 2, this.capHeight);
        ctx.fillRect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, this.capHeight);

        // Clear glows immediately so internal geometry doesn't turn muddy
        ctx.shadowBlur = 0; 

        // 4. LAYER 3: ADVANCED STRUCTURAL INNER DEPTH SHADOWS
        // Inner Lip Crease Shadows (112b41)
        ctx.fillStyle = '#050d14';
        ctx.fillRect(this.x - this.capOffset, this.topHeight - 4, this.width + this.capOffset * 2, 4);
        ctx.fillRect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, 4);

        // Drop shadow UNDER the caps looking down/up onto long shafts
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(this.x, this.topHeight, this.width, 8);
        ctx.fillRect(this.x, this.bottomY + this.capHeight, this.width, 8);

        // 5. LAYER 4: ANIME STYLE CHROME GLOW STRIPS (DYNAMIC NEON RECTANGLES)
        const pulseWidth = 2 + Math.sin(this.glowPulse) * 1.5;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        
        // Vertical sheen streak running through both pipes symmetrically
        const stripX = this.x + this.width * 0.35;
        ctx.fillRect(stripX, 0, pulseWidth, this.topHeight - this.capHeight);
        ctx.fillRect(stripX, this.bottomY + this.capHeight, pulseWidth, this.bottomHeight - this.capHeight);

        // Horizontal accent line details embedded directly on cap rims
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(this.x - this.capOffset + 4, this.topHeight - this.capHeight + 4, this.width + (this.capOffset * 2) - 8, 2);
        ctx.fillRect(this.x - this.capOffset + 4, this.bottomY + this.capHeight - 6, this.width + (this.capOffset * 2) - 8, 2);

        // 6. LAYER 5: VECTOR STROKE WRAPPING (CLEANS UP OVERLAPS)
        ctx.strokeStyle = '#050d14';
        ctx.lineWidth = 2.5;

        // Draw Shaft Outlines
        ctx.beginPath();
        ctx.rect(this.x, -10, this.width, this.topHeight - this.capHeight + 10);
        ctx.rect(this.x, this.bottomY + this.capHeight, this.width, this.bottomHeight + 10);
        ctx.stroke();

        // Draw Cap Outlines
        ctx.beginPath();
        ctx.rect(this.x - this.capOffset, this.topHeight - this.capHeight, this.width + this.capOffset * 2, this.capHeight);
        ctx.rect(this.x - this.capOffset, this.bottomY, this.width + this.capOffset * 2, this.capHeight);
        ctx.stroke();

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
        // Stop drawing entirely once the floating text fades out
        if (this.collected && this.textAlpha <= 0) return;

        ctx.save();

        if (!this.collected) {
            // --- DRAW THE GOLD SPINNING COIN ---
            ctx.translate(this.x, this.y);
            
            // Calculate a true 3D horizontal flip scale matrix
            const currentScaleX = Math.cos(this.angle);
            ctx.scale(Math.abs(currentScaleX), 1);

            // Dynamic lighting depth: shifts color slightly depending on the spin angle
            const isFront = currentScaleX > 0;
            const coinGold = isFront ? '#ffd22e' : '#e6b61f';
            const edgeCopper = isFront ? '#ff7220' : '#d45611';

            // Layer 1: Enhanced Golden Radial Ambient Glow
            ctx.shadowColor = 'rgba(255, 210, 46, 0.6)';
            ctx.shadowBlur = 15;

            // Layer 2: Main Coin Body Solid Fill
            ctx.fillStyle = coinGold;
            ctx.beginPath();
            ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            ctx.fill();

            // Layer 3: Thick Premium Outer Rim
            ctx.shadowBlur = 0; // Clear shadow for crisp line work
            ctx.strokeStyle = edgeCopper;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Layer 4: Delicate Inset Detail Ring
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, (this.size / 2) - 3, 0, Math.PI * 2);
            ctx.stroke();

            // Layer 5: Embossed "$" Currency Symbol
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
        ctx.arc(-2,5,26,0,PIE_2);
        ctx.arc(19,-5,28,0,PIE_2);
        ctx.arc(49,-3,26,0,PIE_2);
        ctx.arc(73,7,28,0,PIE_2);
        ctx.arc(35,18,30,0,PIE_2);
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

function drawPowerUpMeters() {
    let y = 48; 
    const w = 190, h = 16, pad = 15; // Balanced visual layout anchors

    // 🚀 STYLES CONFIG: Added 'isBar' flag to change layout style dynamically
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
        
        // 🚀 NEW NON-BAR PASSIVES (Like your Phoenix revival state)
        phoenix:     { txt: "PHOENIX REVIVE", ico: "🔥", cA: "#ff7b00", cB: "#963a00", max: 0,   isBar: false }
    };

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Lock straight to absolute screen coordinates
    ctx.shadowBlur = 0; // Hardware acceleration performance maintainer

    Object.keys(powerUpsState).forEach(key => {
        const active = powerUpsState[key], s = styles[key];
        if (!active || !s) return; // Skip if power-up isn't active or config doesn't exist

        const time = powerUpTimers[key] || 0;
        const isLow = s.isBar && time < 120;
        const fillW = s.isBar ? w * (time / s.max) : 0;
        const flashCondition = isLow && (Math.floor(frameCount / 4) % 2 === 0);

        // STYLE METHOD A: TIMED PROGRESS BAR LAYOUT (`isBar === true`)
        if (s.isBar) {
            if (time <= 0) return; // Hide bars if out of time frames
            const secStr = `${(time / 60).toFixed(1)}s`;

            ctx.textBaseline = "bottom";

            // Oversized Icon
            ctx.font = "22px sans-serif"; ctx.textAlign = "left";
            ctx.fillText(s.ico, pad, y - 4);

            // Label Text
            ctx.fillStyle = "#ffffff";
            ctx.font = "500 17px 'Impact', 'Arial Black', sans-serif";
            ctx.letterSpacing = "2px";
            ctx.fillText(s.txt, pad + 28, y - 6);

            // Timer Clock Text
            ctx.fillStyle = flashCondition ? "#ff333c" : s.cA;
            ctx.font = "900 13px monospace"; ctx.textAlign = "right";
            ctx.fillText(secStr, pad + w, y - 6);

            // Slanted Track Backing
            ctx.fillStyle = "rgba(4, 8, 18, 0.9)"; ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(pad, y); ctx.lineTo(pad + w, y);
            ctx.lineTo(pad + w + 5, y + h); ctx.lineTo(pad + 5, y + h);
            ctx.closePath(); ctx.fill(); ctx.stroke();

            // Progress Fill
            if (fillW > 2) {
                ctx.save();
                const grad = ctx.createLinearGradient(pad, 0, pad + w, 0);
                grad.addColorStop(0, s.cB); grad.addColorStop(1, s.cA);
                ctx.fillStyle = grad;

                ctx.beginPath();
                ctx.moveTo(pad, y); ctx.lineTo(pad + fillW, y);
                ctx.lineTo(pad + 5 + fillW, y + h); ctx.lineTo(pad + 5, y + h);
                ctx.closePath(); ctx.fill();

                ctx.strokeStyle = flashCondition ? "#ff003c" : s.cA;
                ctx.lineWidth = 1.5; ctx.stroke();
                
                // Tube shine lines
                ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(pad + 1, y + 2); ctx.lineTo(pad + fillW - 1, y + 2); ctx.stroke();
                ctx.restore();
            }

            // Interface Frame Brackets
            ctx.strokeStyle = flashCondition ? "#ff003c" : "rgba(255,255,255,0.2)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad - 6, y - 2); ctx.lineTo(pad - 6, y + h + 2); ctx.lineTo(pad, y + h + 2);
            ctx.stroke();

            y += 58; // Step height layout calculation down for next item
        } 
        
        // STYLE METHOD B: INFINITE OR TOGGLE TOKEN BADGE (`isBar === false`)
        else {
            ctx.save();
            const badgeSize = 32;
            const pulseRadius = Math.sin(frameCount * 0.08) * 3;

            // Ambient background token tray shape
            ctx.fillStyle = "rgba(4, 8, 18, 0.85)";
            ctx.strokeStyle = s.cA;
            ctx.lineWidth = 2;
            
            // Draw a high-tech diamond/hexagon styled socket for the token icon
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

            // Render the Big Emoji Symbol inside the center of the active token
            ctx.font = `${20 + pulseRadius}px sans-serif`; // Gives the item a breathing pulse effect
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(s.ico, pad + (badgeSize / 2) + 12, y + (badgeSize / 2) - 10);

            // Data descriptor tracking string text sat directly next to it
            ctx.fillStyle = `rgb(195, 232, 241)`;
            ctx.font = "500 17px 'Impact', 'Arial Black', sans-serif";
            ctx.letterSpacing = "2px";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(s.txt, pad + badgeSize + 28, y + (badgeSize / 2) - 12);

            ctx.fillStyle = s.cA;
            ctx.font = "700 10px monospace";
            ctx.fillText("ACTIVE PASSIVE", pad + badgeSize + 28, y + (badgeSize / 2) + 4);

            ctx.restore();
            y += 46;
        }
    });
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
        this.drawSunAndMoon();

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
}

class Mountain {
    constructor(baseY, height, peakColor, shadowColor, layers = 7) {
        this.baseY = baseY;           // The bottom anchor line of the mountain
        this.height = height;         // Maximum peak height factor
        this.peakColor = peakColor;   // Highlight sunset orange/pink color
        this.shadowColor = shadowColor; // Deep blue valley shadow color
        this.points = [];             // 🚀 STATIC POSITION CACHE: Calculated once, stays fixed!

        this.generateShape(layers);
    }

    // 🚀 Midpoint Displacement Algorithm (Creates beautiful, natural jagged mountain peaks)
    generateShape(layers) {
        let segments = Math.pow(2, layers);
        this.points = new Array(segments + 1);
        
        // Lock absolute boundaries
        this.points[0] = this.baseY - (Math.random() * this.height * 0.3);
        this.points[segments] = this.baseY - (Math.random() * this.height * 0.3);
        
        let roughness = 0.45; // Controls how sharp or smooth the mountain peaks look
        let displacement = this.height;

        // Recursive generation loop
        for (let i = 1; i <= layers; i++) {
            let stride = segments / Math.pow(2, i);
            let mid = stride;

            while (mid < segments) {
                let left = mid - stride;
                let right = mid + stride;
                
                // Displace midpoint position smoothly
                this.points[mid] = (this.points[left] + this.points[right]) / 2 + (Math.random() - 0.5) * displacement;
                
                mid += stride * 2;
            }
            displacement *= roughness;
        }
    }

    draw() {
        if (this.points.length === 0) return;

        ctx.save();
        
        // 1. SETUP MOUNTAIN SUNSET GRADIENT (Matches the warm light shifting to deep blue shadows)
        const mountainGrad = ctx.createLinearGradient(0, this.baseY - this.height, 0, this.baseY);
        mountainGrad.addColorStop(0, this.peakColor);   // Glowing pinkish-orange top
        mountainGrad.addColorStop(0.4, this.peakColor);
        mountainGrad.addColorStop(1, this.shadowColor); // Dark blue vector valley bottom
        
        ctx.fillStyle = mountainGrad;

        // 2. MAP FIXED POINTS ARRAY TO CANVAS PATH
        ctx.beginPath();
        const segmentWidth = canvasWidth / (this.points.length - 1);
        
        // Start bottom-left corner of screen bounds
        ctx.moveTo(0, canvasHeight); 
        ctx.lineTo(0, this.points[0]);

        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(i * segmentWidth, this.points[i]);
        }

        // Close path down right boundary wall back to bottom left
        ctx.lineTo(canvasWidth, canvasHeight);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // Parallax Scrolling Effect Handler
    update(dt) {
        // Optional: If you want background mountains to scroll slowly left:
        // const speed = game_config.pipeSpeed * 0.15; 
        // this.scrollOffset -= speed * (dt / 16.67);
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
    backgroundMountains = [];
    frameCount = 0;
    score = 0;
    flashTimer = 0;
    lastFrameTime = 0;
    lastPipeTime = 0;
    lastCoinTime = 0;
    lastTreeTime = 0;
    lastBushTime = 0;
    lastPowerUpTime = 0;
    scoreEl.textContent = 0;

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