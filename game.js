const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const startBtn = document.getElementById('startBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsMainView = document.getElementById('settingsMainView');
const leaderboardView = document.getElementById('leaderboardView');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const leaderboardBtn = document.getElementById('leaderboardBtn');
const mainMenuBtn = document.getElementById('mainMenuBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const leaderboardBackBtn = document.getElementById('leaderboardBackBtn');
const leaderboardList = document.getElementById('leaderboardList');
const leaderboardStatus = document.getElementById('leaderboardStatus');
const welcomeOverlay = document.getElementById('welcomeOverlay');
const usernameView = document.getElementById('usernameView');
const welcomeMenuView = document.getElementById('welcomeMenuView');
const usernameInput = document.getElementById('usernameInput');
const usernameContinueBtn = document.getElementById('usernameContinueBtn');
const welcomeUserName = document.getElementById('welcomeUserName');
const welcomeStartBtn = document.getElementById('welcomeStartBtn');
const welcomeSettingsBtn = document.getElementById('welcomeSettingsBtn');
const welcomeLeaderboardBtn = document.getElementById('welcomeLeaderboardBtn');
const welcomeExitBtn = document.getElementById('welcomeExitBtn');
const exitView = document.getElementById('exitView');

const USERNAME_KEY = 'carRushUsername';
let currentUsername = '';
try {
  currentUsername = localStorage.getItem(USERNAME_KEY) || '';
} catch (e) {
  console.warn('Car Rush: could not read saved username.', e);
}

const LEADERBOARD_KEY = 'carRushLeaderboard';
const LEADERBOARD_MAX = 10;

// Shared, cross-player leaderboard via Firebase Realtime Database, when configured
// in firebase-config.js. Falls back to a per-browser localStorage list otherwise.
let leaderboardRef = null;
try {
  if (
    typeof firebase !== 'undefined' &&
    typeof firebaseConfig !== 'undefined' &&
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== 'YOUR_API_KEY'
  ) {
    firebase.initializeApp(firebaseConfig);
    leaderboardRef = firebase.database().ref('leaderboard');
  }
} catch (e) {
  console.warn('Car Rush: Firebase unavailable, using local leaderboard only.', e);
  leaderboardRef = null;
}

const LANE_COUNT = 4;
const LANE_WIDTH = canvas.width / LANE_COUNT;
const laneCenterX = (lane) => lane * LANE_WIDTH + LANE_WIDTH / 2;

const PLAYER_WIDTH = 62;
const PLAYER_HEIGHT = 104;
const PLAYER_Y = canvas.height - PLAYER_HEIGHT - 24;
const PLAYER_MIN_Y = 60;
const PLAYER_MAX_Y = canvas.height - PLAYER_HEIGHT - 10;
const VERTICAL_SPEED = 5;

const JUMP_FRAMES = 50;
const JUMP_HEIGHT = 115;
const JUMP_SCALE = 0.38;
const MIN_HOVER_ARC = 0.55;
const JUMP_NEAR_RANGE = 45;

const TRAFFIC_TYPES = [
  { width: 58, height: 96, color: '#ff4d4d', minSpeed: 3.2, maxSpeed: 4.6, size: 'small', shape: 'sedan' },
  { width: 58, height: 96, color: '#4dc3ff', minSpeed: 3.0, maxSpeed: 4.2, size: 'small', shape: 'sedan' },
  { width: 72, height: 138, color: '#ffb84d', minSpeed: 2.4, maxSpeed: 3.4, size: 'big', shape: 'truck' },
  { width: 76, height: 168, color: '#8c6dff', minSpeed: 2.0, maxSpeed: 2.8, size: 'big', shape: 'bus' },
];

let player, traffic, score, laneLines, spawnTimer, spawnInterval, gameState, roadOffset;
let isPaused = false;
let floatingTexts = [];

const BONUS_TEXT_FRAMES = 100;

function resetGame() {
  player = {
    lane: 1,
    x: laneCenterX(1) - PLAYER_WIDTH / 2,
    y: PLAYER_Y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    isJumping: false,
    jumpFrame: 0,
    jumpTargets: new Set(),
  };
  traffic = [];
  score = 0;
  spawnTimer = 0;
  spawnInterval = 70;
  roadOffset = 0;
  floatingTexts = [];
  laneLines = buildLaneLines();
  gameState = 'playing';
  updateScoreDisplay();
  EngineSound.start();
}

function buildLaneLines() {
  const lines = [];
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = lane * LANE_WIDTH;
    for (let y = -40; y < canvas.height; y += 40) {
      lines.push({ x, y });
    }
  }
  return lines;
}

function updateScoreDisplay() {
  scoreEl.textContent = `Score: ${score}`;
}

function spawnVehicle() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  const type = TRAFFIC_TYPES[Math.floor(Math.random() * TRAFFIC_TYPES.length)];
  const speed = type.minSpeed + Math.random() * (type.maxSpeed - type.minSpeed);

  const overlapsLane = traffic.some((v) => v.lane === lane && v.y < 160);
  if (overlapsLane) return;

  traffic.push({
    lane,
    x: laneCenterX(lane) - type.width / 2,
    y: -type.height,
    width: type.width,
    height: type.height,
    color: type.color,
    size: type.size,
    shape: type.shape,
    speed,
    passed: false,
    jumpCleared: false,
    bonusAwarded: false,
  });
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function update() {
  if (gameState !== 'playing' || isPaused) return;

  const targetX = laneCenterX(player.lane) - player.width / 2;
  player.x += (targetX - player.x) * 0.25;

  if (keysPressed.up) {
    player.y = Math.max(PLAYER_MIN_Y, player.y - VERTICAL_SPEED);
  }
  if (keysPressed.down) {
    player.y = Math.min(PLAYER_MAX_Y, player.y + VERTICAL_SPEED);
  }

  if (player.isJumping) {
    player.jumpFrame++;
    if (player.jumpFrame >= JUMP_FRAMES) {
      player.isJumping = false;
      player.jumpFrame = 0;
      resolveJumpLanding();
    }
  }

  roadOffset = (roadOffset + 6) % 40;

  const speed01 = Math.min(1, 0.15 + score / 30);
  EngineSound.setSpeed(speed01);

  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnVehicle();
    spawnInterval = Math.max(32, 70 - Math.floor(score / 5));
  }

  for (const v of traffic) {
    v.y += v.speed;
    if (!v.passed && v.y > player.y + player.height) {
      v.passed = true;
      score++;
      updateScoreDisplay();
    }
    if (rectsOverlap(player, v)) {
      if (v.size === 'small' && ((player.isJumping && player.jumpTargets.has(v)) || v.jumpCleared)) {
        // Once a jump has cleared this vehicle, keep it safe even after landing
        // while it's still passing underneath — no retroactive crash. Whether it
        // earns a bonus is decided separately, once you actually land (see
        // resolveJumpLanding) — only landing back in the car's own lane counts.
        v.jumpCleared = true;
      } else if (v.size === 'big' && player.isJumping) {
        // Mid-air over a big vehicle: no crash yet — only matters where you are
        // when you land. Switch lanes before the jump ends and you're clear.
      } else {
        gameOver();
      }
    }
  }

  traffic = traffic.filter((v) => v.y < canvas.height + 40);

  for (const t of floatingTexts) {
    t.frame++;
  }
  floatingTexts = floatingTexts.filter((t) => t.frame < BONUS_TEXT_FRAMES);
}

function resolveJumpLanding() {
  // A jump only counts as a "successful" hurdle — worth a bonus — if you land
  // back in the same lane as a small car you cleared. Jump but dodge into a
  // different lane before touching down, and no bonus is awarded for it.
  for (const v of traffic) {
    if (v.size === 'small' && v.jumpCleared && !v.bonusAwarded && v.lane === player.lane) {
      v.bonusAwarded = true;
      awardJumpBonus(v);
    }
  }
}

function awardJumpBonus(v) {
  score += 5;
  updateScoreDisplay();
  EngineSound.playBonus();

  floatingTexts.push({
    text: '+5',
    startX: v.x + v.width / 2,
    startY: v.y + v.height / 2,
    targetX: canvas.width - 30,
    targetY: 26,
    frame: 0,
  });
}

function gameOver() {
  gameState = 'gameover';
  overlayTitle.textContent = 'Crashed!';
  overlayMessage.innerHTML = `You scored <strong>${score}</strong> points.<br>Try again?`;
  startBtn.textContent = 'Restart';
  overlay.classList.remove('hidden');
  EngineSound.stop();
  EngineSound.playCrash();
  saveScoreToLeaderboard(score);
}

function loadLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Car Rush: could not read leaderboard from localStorage.', e);
    return [];
  }
}

function saveToLocalLeaderboard(entry) {
  const entries = loadLocalLeaderboard();
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  entries.length = Math.min(entries.length, LEADERBOARD_MAX);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Car Rush: could not save score to localStorage.', e);
  }
}

function saveScoreToLeaderboard(finalScore) {
  const entry = { name: currentUsername || 'Player', score: finalScore, date: new Date().toLocaleDateString() };

  if (leaderboardRef) {
    leaderboardRef.push(entry).catch((e) => {
      console.warn('Car Rush: could not save score to the shared leaderboard, saving locally instead.', e);
      saveToLocalLeaderboard(entry);
    });
  } else {
    saveToLocalLeaderboard(entry);
  }
}

function renderLeaderboard() {
  leaderboardList.innerHTML = '';
  leaderboardStatus.textContent = '';

  if (!leaderboardRef) {
    leaderboardStatus.textContent = 'Showing scores saved on this device only.';
    renderLeaderboardEntries(loadLocalLeaderboard());
    return;
  }

  leaderboardList.innerHTML = '<div class="leaderboard-empty">Loading scores…</div>';
  leaderboardRef
    .orderByChild('score')
    .limitToLast(LEADERBOARD_MAX)
    .once('value')
    .then((snapshot) => {
      const entries = [];
      snapshot.forEach((child) => entries.push(child.val()));
      entries.sort((a, b) => b.score - a.score);
      leaderboardStatus.textContent = 'Shared with everyone who plays this game.';
      renderLeaderboardEntries(entries);
    })
    .catch((e) => {
      console.warn('Car Rush: could not load the shared leaderboard, showing local scores instead.', e);
      leaderboardStatus.textContent = 'Could not reach the shared leaderboard — showing scores saved on this device.';
      renderLeaderboardEntries(loadLocalLeaderboard());
    });
}

function renderLeaderboardEntries(entries) {
  leaderboardList.innerHTML = '';

  if (entries.length === 0) {
    leaderboardList.innerHTML = '<div class="leaderboard-empty">No games played yet — go crash a few cars!</div>';
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'lb-name';
    nameSpan.textContent = entry.name || 'Player';
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'lb-score';
    scoreSpan.textContent = `${entry.score} pts`;
    const dateSpan = document.createElement('span');
    dateSpan.className = 'lb-date';
    dateSpan.textContent = entry.date || '';
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    li.appendChild(dateSpan);
    leaderboardList.appendChild(li);
  }
}

function drawRoad() {
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#2f333a';
  ctx.fillRect(0, 0, 10, canvas.height);
  ctx.fillRect(canvas.width - 10, 0, 10, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 18]);
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = lane * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, roadOffset - 40);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  let b = (num & 0x0000ff) + Math.round(255 * percent);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawWheels(x, y, width, height, axleFractions) {
  ctx.fillStyle = '#1a1a1a';
  const wheelW = width * 0.15;
  const wheelH = height * 0.08;
  for (const f of axleFractions) {
    const wy = y + height * f - wheelH / 2;
    ctx.fillRect(x - wheelW * 0.35, wy, wheelW, wheelH);
    ctx.fillRect(x + width - wheelW * 0.65, wy, wheelW, wheelH);
  }
}

function drawLights(x, y, width, height) {
  const lightW = width * 0.12;
  const lightH = height * 0.02;
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(x + width * 0.08, y + 2, lightW, lightH);
  ctx.fillRect(x + width - width * 0.08 - lightW, y + 2, lightW, lightH);
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(x + width * 0.08, y + height - lightH - 2, lightW, lightH);
  ctx.fillRect(x + width - width * 0.08 - lightW, y + height - lightH - 2, lightW, lightH);
}

// Small car: tapered hood, windshield/rear window, roof panel, mirrors.
function drawSedan(x, y, width, height, color, windowColor, withStripe) {
  const taper = width * 0.14;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + taper, y);
  ctx.lineTo(x + width - taper, y);
  ctx.lineTo(x + width, y + height * 0.22);
  ctx.lineTo(x + width, y + height - 10);
  ctx.quadraticCurveTo(x + width, y + height, x + width - 10, y + height);
  ctx.lineTo(x + 10, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - 10);
  ctx.lineTo(x, y + height * 0.22);
  ctx.closePath();
  ctx.fill();

  if (withStripe) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + width / 2 - width * 0.045, y + height * 0.08, width * 0.09, height * 0.84);
  }

  ctx.fillStyle = shadeColor(color, -0.12);
  roundRect(x + width * 0.14, y + height * 0.36, width * 0.72, height * 0.26, 6);
  ctx.fill();

  ctx.fillStyle = windowColor || 'rgba(20,20,20,0.35)';
  roundRect(x + width * 0.16, y + height * 0.1, width * 0.68, height * 0.19, 5);
  ctx.fill();
  roundRect(x + width * 0.18, y + height * 0.68, width * 0.64, height * 0.17, 5);
  ctx.fill();

  ctx.fillStyle = shadeColor(color, -0.25);
  ctx.fillRect(x - width * 0.06, y + height * 0.22, width * 0.08, height * 0.05);
  ctx.fillRect(x + width - width * 0.02, y + height * 0.22, width * 0.08, height * 0.05);

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.16, 0.82]);
}

// Delivery truck: dark cab up front, boxy cargo bed behind, three axles.
function drawTruck(x, y, width, height, color) {
  const cabHeight = height * 0.22;

  ctx.fillStyle = color;
  roundRect(x, y + cabHeight - 4, width, height - cabHeight + 4, 8);
  ctx.fill();

  ctx.strokeStyle = shadeColor(color, -0.18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + cabHeight + 16);
  ctx.lineTo(x + width - 6, y + cabHeight + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + cabHeight + 16);
  ctx.lineTo(x + width / 2, y + height - 6);
  ctx.stroke();

  ctx.fillStyle = shadeColor(color, -0.3);
  roundRect(x + width * 0.06, y, width * 0.88, cabHeight + 6, 8);
  ctx.fill();

  ctx.fillStyle = 'rgba(20,20,20,0.4)';
  roundRect(x + width * 0.16, y + height * 0.03, width * 0.68, cabHeight * 0.55, 4);
  ctx.fill();

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.22, 0.58, 0.9]);
}

// Bus: long boxy body, wide front windshield, a row of passenger windows.
function drawBus(x, y, width, height, color) {
  ctx.fillStyle = color;
  roundRect(x, y, width, height, 12);
  ctx.fill();

  ctx.fillStyle = 'rgba(20,20,20,0.4)';
  roundRect(x + width * 0.1, y + height * 0.05, width * 0.8, height * 0.11, 5);
  ctx.fill();

  ctx.fillStyle = '#fdfdc0';
  roundRect(x + width * 0.32, y + height * 0.018, width * 0.36, height * 0.02, 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(color, 0.22);
  ctx.fillRect(x, y + height * 0.45, width, height * 0.04);

  ctx.fillStyle = 'rgba(20,20,20,0.35)';
  const winCount = 4;
  const winW = width * 0.14;
  const winH = height * 0.08;
  const winGap = (width - winCount * winW) / (winCount + 1);
  for (let i = 0; i < winCount; i++) {
    const wx = x + winGap + i * (winW + winGap);
    roundRect(wx, y + height * 0.58, winW, winH, 3);
    ctx.fill();
  }

  roundRect(x + width * 0.14, y + height * 0.84, width * 0.72, height * 0.09, 4);
  ctx.fill();

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.2, 0.5, 0.85]);
}

function drawTrafficVehicle(v) {
  // Oncoming traffic — rotate 180° so headlights/hood face down toward the
  // player instead of matching the player's own forward-facing orientation.
  const cx = v.x + v.width / 2;
  const cy = v.y + v.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI);
  ctx.translate(-cx, -cy);

  if (v.shape === 'truck') {
    drawTruck(v.x, v.y, v.width, v.height, v.color);
  } else if (v.shape === 'bus') {
    drawBus(v.x, v.y, v.width, v.height, v.color);
  } else {
    drawSedan(v.x, v.y, v.width, v.height, v.color, 'rgba(20,20,20,0.35)', false);
  }

  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function draw() {
  drawRoad();

  for (const v of traffic) {
    drawTrafficVehicle(v);
  }

  if (player) {
    drawPlayer();
  }

  drawFloatingTexts();
}

function drawFloatingTexts() {
  for (const t of floatingTexts) {
    const progress = Math.min(1, t.frame / BONUS_TEXT_FRAMES);
    const eased = 1 - Math.pow(1 - progress, 2);

    const x = t.startX + (t.targetX - t.startX) * eased;
    const y = t.startY + (t.targetY - t.startY) * eased;
    const alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
    const fontSize = 24 - eased * 8;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.strokeText(t.text, x, y);
    ctx.fillStyle = '#3ec1ff';
    ctx.fillText(t.text, x, y);
    ctx.restore();
  }
}

function drawPlayer() {
  const timerArc = player.isJumping ? Math.sin(Math.PI * (player.jumpFrame / JUMP_FRAMES)) : 0;

  // A cleared small vehicle can still be physically passing underneath after the
  // jump timer ends. Keep a light hover over it so landing never renders the two
  // cars flush on top of each other — touch down for real only once it's clear.
  const overlappingSmall = traffic.some((v) => v.size === 'small' && rectsOverlap(player, v));
  const jumpArc = overlappingSmall ? Math.max(timerArc, MIN_HOVER_ARC) : timerArc;

  const lift = jumpArc * JUMP_HEIGHT;
  const scale = 1 + jumpArc * JUMP_SCALE;

  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  const drawW = player.width * scale;
  const drawH = player.height * scale;
  const drawX = cx - drawW / 2;
  const drawY = cy - drawH / 2 - lift;

  if (jumpArc > 0.02) {
    const shadowScale = 1 - jumpArc * 0.4;
    const shW = (player.width * shadowScale) / 2;
    const shH = (player.height * 0.28 * shadowScale) / 2;
    ctx.save();
    ctx.globalAlpha = 0.35 * (1 - jumpArc * 0.6);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, player.y + player.height - shH * 0.6, shW, shH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSedan(drawX, drawY, drawW, drawH, '#3ec1ff', 'rgba(255,255,255,0.5)', true);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

function moveLane(direction) {
  if (gameState !== 'playing') return;
  const next = player.lane + direction;
  if (next >= 0 && next < LANE_COUNT) {
    player.lane = next;
  }
}

function isVehicleNearForJump(v) {
  // "Near" means the car's leading edge is close ahead of the player (or already
  // touching), and it hasn't already driven past — not just anywhere on screen.
  const gapAhead = player.y - (v.y + v.height);
  return gapAhead <= JUMP_NEAR_RANGE && v.y <= player.y + player.height;
}

function triggerJump() {
  if (gameState !== 'playing' || player.isJumping) return;
  player.isJumping = true;
  player.jumpFrame = 0;
  // Only cars that are genuinely close in your lane right now count as this
  // jump's target — jumping too early locks onto nothing, so it won't forgive
  // a car that only arrives later.
  player.jumpTargets = new Set(
    traffic.filter((v) => v.size === 'small' && v.lane === player.lane && !v.jumpCleared && isVehicleNearForJump(v))
  );
}

const keysPressed = { up: false, down: false };
const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'];

window.addEventListener('keydown', (e) => {
  if (NAV_KEYS.includes(e.key)) e.preventDefault();

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    moveLane(-1);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    moveLane(1);
  } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    keysPressed.up = true;
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    keysPressed.down = true;
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    triggerJump();
  } else if (e.key === 'Enter') {
    if (gameState === 'gameover' && settingsModal.classList.contains('hidden')) {
      startBtn.click();
    } else if (gameState === 'playing' && settingsModal.classList.contains('hidden')) {
      openSettings();
    }
  } else if (e.key === 'm' || e.key === 'M') {
    toggleSound();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    keysPressed.up = false;
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    keysPressed.down = false;
  }
});

startBtn.addEventListener('click', () => {
  resetGame();
  overlay.classList.add('hidden');
});

function openSettings() {
  settingsMainView.classList.remove('hidden');
  leaderboardView.classList.add('hidden');
  settingsModal.classList.remove('hidden');
  isPaused = true;
}

function closeSettings() {
  settingsModal.classList.add('hidden');
  isPaused = false;
}

settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);

function toggleSound() {
  EngineSound.setMuted(!EngineSound.isMuted());
  soundToggleBtn.textContent = EngineSound.isMuted() ? '🔇 Sound: OFF' : '🔊 Sound: ON';
}

soundToggleBtn.addEventListener('click', toggleSound);

restartGameBtn.addEventListener('click', () => {
  resetGame();
  overlay.classList.add('hidden');
  welcomeOverlay.classList.add('hidden');
  closeSettings();
});

function returnToMainMenu() {
  gameState = 'idle';
  isPaused = false;
  EngineSound.stop();

  overlay.classList.add('hidden');
  settingsModal.classList.add('hidden');

  welcomeUserName.textContent = currentUsername || 'Player';
  usernameView.classList.add('hidden');
  welcomeMenuView.classList.remove('hidden');
  welcomeOverlay.classList.remove('hidden');
}

mainMenuBtn.addEventListener('click', returnToMainMenu);

function submitUsername() {
  const raw = usernameInput.value.trim();
  const name = (raw || 'Player').slice(0, 16);
  currentUsername = name;
  try {
    localStorage.setItem(USERNAME_KEY, name);
  } catch (e) {
    console.warn('Car Rush: could not save username.', e);
  }
  welcomeUserName.textContent = name;
  usernameView.classList.add('hidden');
  welcomeMenuView.classList.remove('hidden');
}

usernameContinueBtn.addEventListener('click', submitUsername);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitUsername();
  }
});

welcomeStartBtn.addEventListener('click', () => {
  welcomeOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  resetGame();
});

welcomeSettingsBtn.addEventListener('click', () => {
  openSettings();
});

welcomeLeaderboardBtn.addEventListener('click', () => {
  openSettings();
  renderLeaderboard();
  settingsMainView.classList.add('hidden');
  leaderboardView.classList.remove('hidden');
});

welcomeExitBtn.addEventListener('click', () => {
  gameState = 'idle';
  isPaused = false;
  EngineSound.stop();

  // Clear the saved name so the next time this link is opened — by anyone,
  // on this browser — it starts over at the username screen.
  currentUsername = '';
  try {
    localStorage.removeItem(USERNAME_KEY);
  } catch (e) {
    console.warn('Car Rush: could not clear saved username.', e);
  }

  overlay.classList.add('hidden');
  settingsModal.classList.add('hidden');
  usernameView.classList.add('hidden');
  welcomeMenuView.classList.add('hidden');
  exitView.classList.remove('hidden');
  welcomeOverlay.classList.remove('hidden');

  // Best-effort — browsers only allow this to actually close a tab that was
  // opened by a script, so most of the time the goodbye screen is what stays.
  window.close();
});

leaderboardBtn.addEventListener('click', () => {
  renderLeaderboard();
  settingsMainView.classList.add('hidden');
  leaderboardView.classList.remove('hidden');
});

leaderboardBackBtn.addEventListener('click', () => {
  leaderboardView.classList.add('hidden');
  settingsMainView.classList.remove('hidden');
});

gameState = 'idle';
player = {
  lane: 1,
  x: laneCenterX(1) - PLAYER_WIDTH / 2,
  y: PLAYER_Y,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  isJumping: false,
  jumpFrame: 0,
};
traffic = [];
roadOffset = 0;

// First-time visitors (no saved username) get the welcome flow — username entry,
// then a menu with Start Game / Settings / Leaderboard. Returning visitors go
// straight to the normal start screen, same as before.
if (!currentUsername) {
  overlay.classList.add('hidden');
  welcomeOverlay.classList.remove('hidden');
}

draw();
requestAnimationFrame(loop);
