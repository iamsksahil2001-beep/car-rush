const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
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
const fullscreenBtn = document.getElementById('fullscreenBtn');
const welcomeFullscreenBtn = document.getElementById('welcomeFullscreenBtn');
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
const howToPlayView = document.getElementById('howToPlayView');
const howToPlayStartBtn = document.getElementById('howToPlayStartBtn');

const USERNAME_KEY = 'carRushUsername';
const TUTORIAL_KEY = 'carRushTutorialSeen';
let currentUsername = '';
let hasSeenTutorial = false;
try {
  currentUsername = localStorage.getItem(USERNAME_KEY) || '';
  hasSeenTutorial = localStorage.getItem(TUTORIAL_KEY) === 'true';
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
const ROAD_MARGIN = 60;
const ROAD_WIDTH = canvas.width - ROAD_MARGIN * 2;
const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const laneCenterX = (lane) => ROAD_MARGIN + lane * LANE_WIDTH + LANE_WIDTH / 2;

// Fixed asphalt grain speckles, generated once so the texture doesn't flicker
// between frames — scrolled each frame via roadScrollTotal.
const ASPHALT_SPECKS = Array.from({ length: 90 }, () => ({
  xFrac: Math.random(),
  baseY: Math.random() * canvas.height,
  r: 0.6 + Math.random() * 1.5,
  shade: Math.random() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.07)',
}));

// Rooftop buildings lining both shoulders, seen from above to match the
// top-down view. A fixed-height tile of buildings repeats and scrolls past.
const BUILDING_TILE_HEIGHT = 260;
const BUILDING_STRIP_WIDTH = 38;
const BUILDING_ROAD_GAP = 16;
const BUILDING_COLORS = ['#8a8f98', '#9c8468', '#7d6a58', '#6f7a72', '#8f7367', '#7a828c', '#5f6b74'];

function generateBuildingTile() {
  const buildings = [];
  let y = 0;
  while (BUILDING_TILE_HEIGHT - y >= 40) {
    const height = Math.min(70 + Math.random() * 90, BUILDING_TILE_HEIGHT - y);
    buildings.push({
      yStart: y,
      height,
      color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
      vents: 2 + Math.floor(Math.random() * 3),
      hasTank: Math.random() < 0.3,
    });
    y += height + 10 + Math.random() * 10;
  }
  return buildings;
}

const LEFT_BUILDINGS = generateBuildingTile();
const RIGHT_BUILDINGS = generateBuildingTile();

const PLAYER_WIDTH = 62;
const PLAYER_HEIGHT = 104;
const PLAYER_Y = canvas.height - PLAYER_HEIGHT - 24;
const PLAYER_MIN_Y = 60;
const PLAYER_MAX_Y = canvas.height - PLAYER_HEIGHT - 10;
const VERTICAL_SPEED = 5;

const JUMP_FRAMES = 60; // ~1 second at 60fps
const JUMP_HEIGHT = 185;
const JUMP_SCALE = 0.52;
const DOOR_MAX_ANGLE = 0.85;
const DOUBLE_JUMP_FRAMES = 90; // ~1.5 seconds at 60fps
const DOUBLE_JUMP_PEAK = 1.55;
const DOUBLE_JUMP_RISE_FRACTION = 0.35;
const MIN_HOVER_ARC = 0.55;
const JUMP_NEAR_RANGE = 85;

const ZEBRA_INTERVAL_MS = 11000; // a new crossing every real 11 seconds, wall-clock accurate
const ZEBRA_HEIGHT = 74;
const ZEBRA_SPEED = 3.2;
const ZEBRA_STOP_BUFFER = 26;
const FOLLOW_GAP = 46;
const PEDESTRIAN_COLORS = ['#e0574c', '#4c9fe0', '#e0c04c', '#7ac25a', '#b06be0', '#e08a3c'];
const SKIN_TONES = ['#e8b98c', '#c98f5f', '#8d5a3b', '#f2cba0', '#a9744f'];
const HAIR_COLORS = ['#2a1c14', '#111111', '#5a3a24', '#8a7a6a', '#3a2a1a'];

const TRAFFIC_TYPES = [
  { width: 58, height: 96, color: '#ff4d4d', minSpeed: 3.2, maxSpeed: 4.6, size: 'small', shape: 'sedan' },
  { width: 58, height: 96, color: '#4dc3ff', minSpeed: 3.0, maxSpeed: 4.2, size: 'small', shape: 'sedan' },
  { width: 72, height: 138, color: '#ffb84d', minSpeed: 2.4, maxSpeed: 3.4, size: 'big', shape: 'truck' },
  { width: 76, height: 168, color: '#8c6dff', minSpeed: 2.0, maxSpeed: 2.8, size: 'big', shape: 'bus' },
];

let player, traffic, score, laneLines, spawnTimer, spawnInterval, gameState, roadOffset;
let roadScrollTotal = 0;
let buildingScrollTotal = 0;
let zebraEvent = null;
let zebraNextTime = 0;
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
    doubleJumpActive: false,
    doubleJumpUsed: false,
    doubleJumpBase: 0,
    doubleJumpFrames: JUMP_FRAMES,
  };
  traffic = [];
  score = 0;
  spawnTimer = 0;
  spawnInterval = 70;
  roadOffset = 0;
  roadScrollTotal = 0;
  buildingScrollTotal = 0;
  zebraEvent = null;
  zebraNextTime = performance.now() + ZEBRA_INTERVAL_MS;
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
    stoppedForCrossing: false,
  });
}

function spawnZebraEvent() {
  const pedCount = 2 + Math.floor(Math.random() * 3);
  const pedestrians = [];
  for (let i = 0; i < pedCount; i++) {
    const fromLeft = Math.random() < 0.5;
    const width = 16;
    const height = 30;
    pedestrians.push({
      x: fromLeft ? ROAD_MARGIN - width - Math.random() * 50 : ROAD_MARGIN + ROAD_WIDTH + Math.random() * 50,
      offsetY: 12 + Math.random() * (ZEBRA_HEIGHT - 24),
      width,
      height,
      speed: (fromLeft ? 1 : -1) * (0.55 + Math.random() * 0.45),
      color: PEDESTRIAN_COLORS[Math.floor(Math.random() * PEDESTRIAN_COLORS.length)],
      skinTone: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
      walkPhase: Math.random() * Math.PI * 2,
      jumpCleared: false,
      bonusAwarded: false,
    });
  }
  return {
    y: -ZEBRA_HEIGHT,
    height: ZEBRA_HEIGHT,
    speed: ZEBRA_SPEED,
    pedestrians,
  };
}

function updateZebraEvent() {
  zebraEvent.y += zebraEvent.speed;

  for (const p of zebraEvent.pedestrians) {
    p.x += p.speed;
    p.walkPhase += 0.14;
  }

  for (const p of zebraEvent.pedestrians) {
    const pedRect = { x: p.x, y: zebraEvent.y + p.offsetY, width: p.width, height: p.height };
    if (rectsOverlap(player, pedRect)) {
      // Jumping clears a pedestrian just like a small car. Whether it earns a
      // bonus is decided separately once you land (see resolveJumpLanding).
      if ((player.isJumping && player.jumpTargets.has(p)) || p.jumpCleared) {
        p.jumpCleared = true;
      } else {
        gameOver();
        return;
      }
    }
  }

  if (zebraEvent.y > player.y + player.height) {
    zebraEvent = null;
    for (const v of traffic) {
      v.stoppedForCrossing = false;
    }
  }
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
    const totalJumpFrames = player.doubleJumpActive ? player.doubleJumpFrames : JUMP_FRAMES;
    if (player.jumpFrame >= totalJumpFrames) {
      player.isJumping = false;
      player.doubleJumpActive = false;
      player.jumpFrame = 0;
      resolveJumpLanding();
    }
  }

  roadOffset = (roadOffset + 6) % 40;
  roadScrollTotal = (roadScrollTotal + 6) % canvas.height;
  buildingScrollTotal = (buildingScrollTotal + 3) % BUILDING_TILE_HEIGHT;

  const speed01 = Math.min(1, 0.15 + score / 30);
  EngineSound.setSpeed(speed01);

  if (!zebraEvent && performance.now() >= zebraNextTime) {
    zebraEvent = spawnZebraEvent();
    zebraNextTime = performance.now() + ZEBRA_INTERVAL_MS;
  }
  if (zebraEvent) {
    updateZebraEvent();
  }

  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    if (!zebraEvent) {
      spawnVehicle();
    }
    spawnInterval = Math.max(32, 70 - Math.floor(score / 5));
  }

  // A faster vehicle eases down to match the speed of a slower one it's
  // catching up to in the same lane, instead of visually overlapping it —
  // it keeps moving, just no faster than whatever's directly ahead of it.
  for (const v of traffic) {
    v.moveSpeed = v.speed;
    let aheadGap = Infinity;
    let aheadSpeed = null;
    for (const other of traffic) {
      if (other === v || other.lane !== v.lane || other.y <= v.y) continue;
      const gap = other.y - (v.y + v.height);
      if (gap < aheadGap) {
        aheadGap = gap;
        aheadSpeed = other.speed;
      }
    }
    if (aheadSpeed !== null && aheadGap < FOLLOW_GAP && v.speed > aheadSpeed) {
      v.moveSpeed = aheadSpeed;
    }
  }

  for (const v of traffic) {
    if (zebraEvent && !v.stoppedForCrossing) {
      const alreadyPast = v.y > zebraEvent.y + zebraEvent.height;
      if (!alreadyPast && v.y + v.height >= zebraEvent.y - ZEBRA_STOP_BUFFER) {
        // Lock the stop in for the rest of this crossing — re-checking the
        // gap every frame let a stopped car "catch up" and creep forward as
        // the crossing scrolled on ahead, instead of staying put before it.
        v.stoppedForCrossing = true;
      }
    }

    if (!(zebraEvent && v.stoppedForCrossing)) {
      v.y += v.moveSpeed;
    }

    if (!v.passed && v.y > player.y + player.height) {
      v.passed = true;
      score++;
      updateScoreDisplay();
    }
    if (rectsOverlap(player, v)) {
      if (v.jumpCleared) {
        // Already cleared by an earlier touch this jump — stays safe even
        // after landing while it's still passing underneath.
      } else if (player.isJumping) {
        if (player.jumpTargets.has(v)) {
          // A vehicle you actually timed this jump for — small car or big
          // truck/bus alike — is cleared for good, landing on it included.
          // Whether it earns a bonus is decided separately (resolveJumpLanding).
          v.jumpCleared = true;
        }
        // Otherwise: mid-air pass-through only — safe for now (e.g. drifted
        // into it while switching lanes), but not cleared. Still overlapping
        // once you land is a crash, so you have to be clear of it by then.
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
  // back where the thing you cleared actually was. Jump but dodge away before
  // touching down (a different lane for a car, a different spot for a
  // pedestrian), and no bonus is awarded for it.
  for (const v of traffic) {
    if (v.jumpCleared && !v.bonusAwarded && v.lane === player.lane) {
      v.bonusAwarded = true;
      awardJumpBonus(v.x + v.width / 2, v.y + v.height / 2);
    }
  }

  if (zebraEvent) {
    for (const p of zebraEvent.pedestrians) {
      if (p.jumpCleared && !p.bonusAwarded) {
        const pedX = p.x;
        const pedY = zebraEvent.y + p.offsetY;
        const xOverlap = pedX < player.x + player.width + 20 && pedX + p.width > player.x - 20;
        if (xOverlap) {
          p.bonusAwarded = true;
          awardJumpBonus(pedX + p.width / 2, pedY + p.height / 2);
        }
      }
    }
  }
}

function awardJumpBonus(sourceX, sourceY) {
  score += 5;
  updateScoreDisplay();
  EngineSound.playBonus();

  floatingTexts.push({
    text: '+5',
    startX: sourceX,
    startY: sourceY,
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

function drawBuildingRoof(x, y, width, height, b) {
  // Cast shadow (down-right) to suggest height from directly overhead.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 5, y + 5, width, height);

  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, width, height);

  const sheen = ctx.createLinearGradient(x, y, x, y + height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

  const vGap = height / (b.vents + 1);
  for (let i = 1; i <= b.vents; i++) {
    const vy = y + vGap * i - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x + width * 0.18, vy, width * 0.24, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + width * 0.18, vy, width * 0.24, 2);
  }

  if (b.hasTank) {
    const r = Math.min(width, height) * 0.14;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(x + width * 0.72, y + height * 0.25, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(x + width * 0.68, y + height * 0.22, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuildingSide(stripX, buildings) {
  const offset = buildingScrollTotal % BUILDING_TILE_HEIGHT;
  for (let baseY = offset - BUILDING_TILE_HEIGHT; baseY < canvas.height; baseY += BUILDING_TILE_HEIGHT) {
    for (const b of buildings) {
      const by = baseY + b.yStart;
      if (by + b.height < 0 || by > canvas.height) continue;
      drawBuildingRoof(stripX, by, BUILDING_STRIP_WIDTH, b.height, b);
    }
  }
}

function drawRoad() {
  const roadX = ROAD_MARGIN;

  // Grass shoulders, with scrolling mowed-stripe bands for a sense of motion.
  ctx.fillStyle = '#2c5c37';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  const stripeH = 46;
  for (let y = -stripeH * 2; y < canvas.height + stripeH * 2; y += stripeH * 2) {
    const yy = (((y + roadScrollTotal) % (canvas.height + stripeH * 2)) + canvas.height + stripeH * 2) % (canvas.height + stripeH * 2) - stripeH;
    ctx.fillRect(0, yy, roadX, stripeH);
    ctx.fillRect(canvas.width - roadX, yy, roadX, stripeH);
  }

  // Buildings lining both shoulders, seen from above.
  drawBuildingSide(roadX - BUILDING_ROAD_GAP - BUILDING_STRIP_WIDTH, LEFT_BUILDINGS);
  drawBuildingSide(canvas.width - roadX + BUILDING_ROAD_GAP, RIGHT_BUILDINGS);

  // Asphalt surface with a subtle center-lit gradient.
  const asphaltGradient = ctx.createLinearGradient(roadX, 0, roadX + ROAD_WIDTH, 0);
  asphaltGradient.addColorStop(0, '#33383f');
  asphaltGradient.addColorStop(0.5, '#3f454d');
  asphaltGradient.addColorStop(1, '#33383f');
  ctx.fillStyle = asphaltGradient;
  ctx.fillRect(roadX, 0, ROAD_WIDTH, canvas.height);

  // Asphalt grain — fixed speckles that scroll with the road.
  for (const speck of ASPHALT_SPECKS) {
    const sy = (speck.baseY + roadScrollTotal) % canvas.height;
    ctx.fillStyle = speck.shade;
    ctx.beginPath();
    ctx.arc(roadX + speck.xFrac * ROAD_WIDTH, sy, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Concrete curb between grass and asphalt.
  ctx.fillStyle = '#c7c7c0';
  ctx.fillRect(roadX - 4, 0, 4, canvas.height);
  ctx.fillRect(roadX + ROAD_WIDTH, 0, 4, canvas.height);

  // Solid white shoulder lines along both edges of the roadway.
  ctx.strokeStyle = 'rgba(250,250,245,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(roadX + 3, 0);
  ctx.lineTo(roadX + 3, canvas.height);
  ctx.moveTo(roadX + ROAD_WIDTH - 3, 0);
  ctx.lineTo(roadX + ROAD_WIDTH - 3, canvas.height);
  ctx.stroke();

  // Dashed lane divider lines, scrolling to sell forward motion.
  ctx.strokeStyle = 'rgba(244,244,238,0.8)';
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 22]);
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = roadX + lane * LANE_WIDTH;
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

function drawGroundShadow(x, y, width, height, strength) {
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height * 0.94, width * 0.46, height * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWheels(x, y, width, height, axleFractions) {
  const wheelW = width * 0.16;
  const wheelH = height * 0.085;
  for (const f of axleFractions) {
    const wy = y + height * f - wheelH / 2;
    for (const wx of [x - wheelW * 0.32, x + width - wheelW * 0.68]) {
      ctx.fillStyle = '#111';
      roundRect(wx, wy, wheelW, wheelH, wheelH * 0.4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(wx + wheelW * 0.2, wy + wheelH * 0.42, wheelW * 0.6, wheelH * 0.16);
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(wx + wheelW / 2, wy + wheelH / 2, wheelH * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLights(x, y, width, height) {
  const lightW = width * 0.11;
  const lightH = height * 0.022;

  ctx.save();
  ctx.shadowColor = 'rgba(255, 244, 190, 0.9)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#fff6c8';
  roundRect(x + width * 0.09, y + 2, lightW, lightH, lightH / 2);
  ctx.fill();
  roundRect(x + width - width * 0.09 - lightW, y + 2, lightW, lightH, lightH / 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(255, 60, 60, 0.9)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#ff3b3b';
  roundRect(x + width * 0.09, y + height - lightH - 2, lightW, lightH, lightH / 2);
  ctx.fill();
  roundRect(x + width - width * 0.09 - lightW, y + height - lightH - 2, lightW, lightH, lightH / 2);
  ctx.fill();
  ctx.restore();
}

function drawGlassPanel(x, y, width, height, radius) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, 'rgba(150, 195, 220, 0.75)');
  gradient.addColorStop(0.55, 'rgba(25, 40, 55, 0.55)');
  gradient.addColorStop(1, 'rgba(10, 18, 26, 0.6)');
  ctx.fillStyle = gradient;
  roundRect(x, y, width, height, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, width * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.14, y + height * 0.18);
  ctx.lineTo(x + width * 0.42, y + height * 0.82);
  ctx.stroke();
}

// Small car: curved fenders, glass-tinted windows, roof sheen, chrome-ish wheels.
// skipShadow lets the player car supply its own jump-aware shadow instead.
function drawSedan(x, y, width, height, color, withStripe, skipShadow) {
  const cx = x + width / 2;

  if (!skipShadow) {
    drawGroundShadow(x, y, width, height, 0.28);
  }

  ctx.beginPath();
  ctx.moveTo(cx - width * 0.2, y);
  ctx.quadraticCurveTo(cx, y - height * 0.012, cx + width * 0.2, y);
  ctx.bezierCurveTo(x + width * 0.86, y + height * 0.05, x + width, y + height * 0.24, x + width, y + height * 0.4);
  ctx.bezierCurveTo(x + width, y + height * 0.58, x + width * 0.94, y + height * 0.84, x + width * 0.82, y + height);
  ctx.lineTo(x + width * 0.18, y + height);
  ctx.bezierCurveTo(x + width * 0.06, y + height * 0.84, x, y + height * 0.58, x, y + height * 0.4);
  ctx.bezierCurveTo(x, y + height * 0.24, x + width * 0.14, y + height * 0.05, cx - width * 0.2, y);
  ctx.closePath();

  const bodyGradient = ctx.createLinearGradient(x, y, x + width, y);
  bodyGradient.addColorStop(0, shadeColor(color, -0.22));
  bodyGradient.addColorStop(0.45, shadeColor(color, 0.16));
  bodyGradient.addColorStop(0.55, shadeColor(color, 0.16));
  bodyGradient.addColorStop(1, shadeColor(color, -0.24));
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = shadeColor(color, -0.4);
  ctx.stroke();

  if (withStripe) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(cx - width * 0.045, y + height * 0.06, width * 0.09, height * 0.88);
  }

  // door seams
  ctx.strokeStyle = shadeColor(color, -0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + width * 0.05, y + height * 0.63);
  ctx.lineTo(x + width * 0.95, y + height * 0.63);
  ctx.stroke();

  const roofGradient = ctx.createLinearGradient(x, y + height * 0.32, x, y + height * 0.66);
  roofGradient.addColorStop(0, shadeColor(color, -0.06));
  roofGradient.addColorStop(0.5, shadeColor(color, 0.14));
  roofGradient.addColorStop(1, shadeColor(color, -0.1));
  ctx.fillStyle = roofGradient;
  roundRect(x + width * 0.15, y + height * 0.34, width * 0.7, height * 0.28, 8);
  ctx.fill();

  drawGlassPanel(x + width * 0.17, y + height * 0.09, width * 0.66, height * 0.19, 6);
  drawGlassPanel(x + width * 0.19, y + height * 0.68, width * 0.62, height * 0.17, 6);

  ctx.fillStyle = shadeColor(color, -0.3);
  roundRect(x - width * 0.05, y + height * 0.23, width * 0.09, height * 0.045, 2);
  ctx.fill();
  roundRect(x + width - width * 0.04, y + height * 0.23, width * 0.09, height * 0.045, 2);
  ctx.fill();

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.17, 0.81]);
}

// Delivery truck: dark cab up front, boxy cargo bed behind, three axles.
function drawTruck(x, y, width, height, color) {
  const cabHeight = height * 0.22;

  drawGroundShadow(x, y, width, height, 0.3);

  const bedGradient = ctx.createLinearGradient(x, y, x + width, y);
  bedGradient.addColorStop(0, shadeColor(color, -0.2));
  bedGradient.addColorStop(0.5, shadeColor(color, 0.1));
  bedGradient.addColorStop(1, shadeColor(color, -0.2));
  ctx.fillStyle = bedGradient;
  roundRect(x, y + cabHeight - 4, width, height - cabHeight + 4, 8);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = shadeColor(color, -0.4);
  roundRect(x, y + cabHeight - 4, width, height - cabHeight + 4, 8);
  ctx.stroke();

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

  const cabGradient = ctx.createLinearGradient(x, y, x + width, y);
  cabGradient.addColorStop(0, shadeColor(color, -0.42));
  cabGradient.addColorStop(0.5, shadeColor(color, -0.2));
  cabGradient.addColorStop(1, shadeColor(color, -0.42));
  ctx.fillStyle = cabGradient;
  roundRect(x + width * 0.06, y, width * 0.88, cabHeight + 6, 8);
  ctx.fill();

  drawGlassPanel(x + width * 0.16, y + height * 0.03, width * 0.68, cabHeight * 0.55, 4);

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.22, 0.58, 0.9]);
}

// Bus: long boxy body, wide front windshield, a row of passenger windows.
function drawBus(x, y, width, height, color) {
  drawGroundShadow(x, y, width, height, 0.3);

  const bodyGradient = ctx.createLinearGradient(x, y, x + width, y);
  bodyGradient.addColorStop(0, shadeColor(color, -0.18));
  bodyGradient.addColorStop(0.5, shadeColor(color, 0.12));
  bodyGradient.addColorStop(1, shadeColor(color, -0.18));
  ctx.fillStyle = bodyGradient;
  roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = shadeColor(color, -0.35);
  roundRect(x, y, width, height, 12);
  ctx.stroke();

  drawGlassPanel(x + width * 0.1, y + height * 0.05, width * 0.8, height * 0.11, 5);

  ctx.fillStyle = '#fdfdc0';
  roundRect(x + width * 0.32, y + height * 0.018, width * 0.36, height * 0.02, 2);
  ctx.fill();

  ctx.fillStyle = shadeColor(color, 0.22);
  ctx.fillRect(x, y + height * 0.45, width, height * 0.04);

  ctx.fillStyle = 'rgba(15,25,35,0.55)';
  const winCount = 4;
  const winW = width * 0.14;
  const winH = height * 0.08;
  const winGap = (width - winCount * winW) / (winCount + 1);
  for (let i = 0; i < winCount; i++) {
    const wx = x + winGap + i * (winW + winGap);
    roundRect(wx, y + height * 0.58, winW, winH, 3);
    ctx.fill();
  }

  drawGlassPanel(x + width * 0.14, y + height * 0.84, width * 0.72, height * 0.09, 4);

  drawLights(x, y, width, height);
  drawWheels(x, y, width, height, [0.2, 0.5, 0.85]);
}

function drawTrafficVehicle(v) {
  // Facing the same way as the player — driving the same direction, as if
  // you're overtaking them, rather than facing toward you as oncoming traffic.
  if (v.shape === 'truck') {
    drawTruck(v.x, v.y, v.width, v.height, v.color);
  } else if (v.shape === 'bus') {
    drawBus(v.x, v.y, v.width, v.height, v.color);
  } else {
    drawSedan(v.x, v.y, v.width, v.height, v.color, false);
  }
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

  if (zebraEvent) {
    drawZebraCrossing(zebraEvent);
    drawTrafficLight(ROAD_MARGIN - 10, zebraEvent.y);
    drawTrafficLight(ROAD_MARGIN + ROAD_WIDTH + 10, zebraEvent.y);
  }

  for (const v of traffic) {
    drawTrafficVehicle(v);
  }

  if (zebraEvent) {
    for (const p of zebraEvent.pedestrians) {
      drawPedestrian(p.x, zebraEvent.y + p.offsetY, p.width, p.height, p);
    }
  }

  if (player) {
    drawPlayer();
  }

  drawFloatingTexts();
}

function drawZebraCrossing(event) {
  // Real crosswalk stripes run parallel to the direction of travel — vertical
  // bars spread across the road's width, not stacked bands across its length.
  const stripeCount = 8;
  const period = ROAD_WIDTH / stripeCount;
  const stripeW = period * 0.55;

  ctx.fillStyle = 'rgba(235,235,228,0.95)';
  for (let i = 0; i < stripeCount; i++) {
    const sx = ROAD_MARGIN + i * period + (period - stripeW) / 2;
    ctx.fillRect(sx, event.y, stripeW, event.height);
  }
}

function drawTrafficLight(x, topY) {
  const poleLen = 54;
  const boxW = 18;
  const boxH = 46;

  ctx.save();
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(x - 2.5, topY, 5, poleLen);

  ctx.fillStyle = '#161616';
  roundRect(x - boxW / 2, topY - boxH, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = '#050505';
  ctx.lineWidth = 1.5;
  roundRect(x - boxW / 2, topY - boxH, boxW, boxH, 4);
  ctx.stroke();

  const lightR = boxW * 0.27;
  const redY = topY - boxH + boxH * 0.22;
  const yellowY = topY - boxH + boxH * 0.52;
  const greenY = topY - boxH + boxH * 0.8;

  // Bright halo behind the lit red light so it reads clearly at a glance.
  const halo = ctx.createRadialGradient(x, redY, 0, x, redY, lightR * 2.4);
  halo.addColorStop(0, 'rgba(255,70,70,0.65)');
  halo.addColorStop(1, 'rgba(255,70,70,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, redY, lightR * 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = 'rgba(255,60,60,1)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff4141';
  ctx.beginPath();
  ctx.arc(x, redY, lightR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#4a4420';
  ctx.beginPath();
  ctx.arc(x, yellowY, lightR, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1e3a24';
  ctx.beginPath();
  ctx.arc(x, greenY, lightR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPedestrian(x, y, width, height, p) {
  const { color, walkPhase } = p;
  const skinTone = p.skinTone || '#e8b98c';
  const hairColor = p.hairColor || '#2a1c14';
  const cx = x + width / 2;
  const legSwing = Math.sin(walkPhase) * (width * 0.32);
  const armSwing = Math.sin(walkPhase + Math.PI) * (width * 0.26);

  ctx.save();
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, y + height - 2, width * 0.4, height * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#33404f';
  ctx.lineWidth = width * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx, y + height * 0.56);
  ctx.lineTo(cx + legSwing, y + height * 0.92);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y + height * 0.56);
  ctx.lineTo(cx - legSwing, y + height * 0.92);
  ctx.stroke();

  // shoes
  ctx.fillStyle = '#1c1c1c';
  ctx.beginPath();
  ctx.ellipse(cx + legSwing, y + height * 0.94, width * 0.16, height * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - legSwing, y + height * 0.94, width * 0.16, height * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shadeColor(color, -0.2);
  ctx.lineWidth = width * 0.16;
  ctx.beginPath();
  ctx.moveTo(cx, y + height * 0.3);
  ctx.lineTo(cx + armSwing, y + height * 0.58);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y + height * 0.3);
  ctx.lineTo(cx - armSwing, y + height * 0.58);
  ctx.stroke();

  // hands
  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.arc(cx + armSwing, y + height * 0.58, width * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - armSwing, y + height * 0.58, width * 0.09, 0, Math.PI * 2);
  ctx.fill();

  const torsoGradient = ctx.createLinearGradient(x, y, x + width, y);
  torsoGradient.addColorStop(0, shadeColor(color, -0.15));
  torsoGradient.addColorStop(0.5, shadeColor(color, 0.1));
  torsoGradient.addColorStop(1, shadeColor(color, -0.15));
  ctx.fillStyle = torsoGradient;
  roundRect(x + width * 0.18, y + height * 0.2, width * 0.64, height * 0.4, width * 0.3);
  ctx.fill();

  ctx.fillStyle = skinTone;
  ctx.beginPath();
  ctx.arc(cx, y + height * 0.12, width * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(cx, y + height * 0.08, width * 0.3, Math.PI, 0);
  ctx.fill();

  ctx.restore();
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

// Quick launch off the ground, smooth arrival at the peak, then a decelerating
// glide back down that softens into landing instead of dropping in at full
// speed — a plain sine arc falls fastest right as it's about to touch down.
function jumpEase(t) {
  if (t <= 0.5) {
    const u = t / 0.5;
    return 1 - (1 - u) * (1 - u);
  }
  const u = (t - 0.5) / 0.5;
  return (1 - u) * (1 - u);
}

// The active jump's height, as a fraction of JUMP_HEIGHT — 0 to 1 for a
// normal single jump, but can climb past 1 during a chained double jump.
function currentJumpArc(p) {
  if (!p.isJumping) return 0;

  if (!p.doubleJumpActive) {
    return jumpEase(p.jumpFrame / JUMP_FRAMES);
  }

  // Double jump: continue up from wherever the first jump left off, climb to
  // a taller peak, then glide back down to the ground — never dips first.
  const t = p.jumpFrame / p.doubleJumpFrames;
  if (t <= DOUBLE_JUMP_RISE_FRACTION) {
    const u = t / DOUBLE_JUMP_RISE_FRACTION;
    const eased = 1 - (1 - u) * (1 - u);
    return p.doubleJumpBase + (DOUBLE_JUMP_PEAK - p.doubleJumpBase) * eased;
  }
  const u = (t - DOUBLE_JUMP_RISE_FRACTION) / (1 - DOUBLE_JUMP_RISE_FRACTION);
  return DOUBLE_JUMP_PEAK * (1 - u) * (1 - u);
}

function drawPlayer() {
  const timerArc = currentJumpArc(player);

  // A cleared small vehicle can still be physically passing underneath after the
  // jump timer ends. Keep a light hover over it so landing never renders the two
  // cars flush on top of each other — touch down for real only once it's clear.
  const overlappingObstacle =
    traffic.some((v) => rectsOverlap(player, v)) ||
    (zebraEvent &&
      zebraEvent.pedestrians.some((p) =>
        rectsOverlap(player, { x: p.x, y: zebraEvent.y + p.offsetY, width: p.width, height: p.height })
      ));
  const jumpArc = overlappingObstacle ? Math.max(timerArc, MIN_HOVER_ARC) : timerArc;

  const lift = jumpArc * JUMP_HEIGHT;
  const scale = 1 + jumpArc * JUMP_SCALE;

  // Squash-and-stretch: a brief vertical stretch right at launch (bigger for
  // the double jump's extra thrust) and a brief squash right before landing —
  // sells the sense of real push-off and impact instead of a flat float.
  let stretchX = 1;
  let stretchY = 1;
  if (player.isJumping) {
    const totalFrames = player.doubleJumpActive ? player.doubleJumpFrames : JUMP_FRAMES;
    const framesIn = player.jumpFrame;
    const framesToLand = totalFrames - player.jumpFrame;
    const launchWindow = 8;
    const landingWindow = 8;

    if (framesIn < launchWindow) {
      const strength = player.doubleJumpActive ? 0.3 : 0.16;
      const t = 1 - framesIn / launchWindow;
      stretchY += strength * t;
      stretchX -= strength * 0.55 * t;
    }
    if (framesToLand < landingWindow) {
      const strength = player.doubleJumpActive ? 0.26 : 0.14;
      const t = 1 - framesToLand / landingWindow;
      stretchY -= strength * t;
      stretchX += strength * 0.6 * t;
    }
  }

  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  const drawW = player.width * scale * stretchX;
  const drawH = player.height * scale * stretchY;
  const drawX = cx - drawW / 2;
  const drawY = cy - drawH / 2 - lift;

  if (player.doubleJumpActive && player.jumpFrame < 14) {
    // A quick expanding ring pulses from the ground the instant the double
    // jump kicks in, like a burst of thrust launching the car higher.
    const t = player.jumpFrame / 14;
    const ringR = player.width * 0.55 * (1 + t * 1.8);
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.5;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, player.y + player.height - 4, ringR, ringR * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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

  if (jumpArc > 0.03) {
    drawFlyingDoor(-1, cx, cy, drawW, drawH, jumpArc, '#3ec1ff');
    drawFlyingDoor(1, cx, cy, drawW, drawH, jumpArc, '#3ec1ff');
  }

  drawSedan(drawX, drawY, drawW, drawH, '#3ec1ff', true, true);
}

// A door that swings out and up while airborne, like the car is taking flight —
// folds back flush against the body the instant it touches back down.
function drawFlyingDoor(side, cx, cy, carWidth, carHeight, openAmount, color) {
  // Hinged right at the car's own edge — the panel grows outward from that
  // fixed point and swings its tip forward, so it visibly emerges from the
  // body on the way up and folds straight back into it on the way down.
  const doorW = carWidth * 0.56 * openAmount;
  const doorH = carHeight * 0.44;
  const hingeX = cx + side * carWidth * 0.46;
  const hingeY = cy - carHeight * 0.04;
  const tilt = -side * openAmount * DOOR_MAX_ANGLE;
  const rectX = side < 0 ? -doorW : 0;

  ctx.save();
  ctx.translate(hingeX, hingeY);
  ctx.rotate(tilt);

  const gradient = ctx.createLinearGradient(rectX, 0, rectX + doorW, 0);
  gradient.addColorStop(0, shadeColor(color, side < 0 ? 0.12 : -0.18));
  gradient.addColorStop(1, shadeColor(color, side < 0 ? -0.18 : 0.12));
  ctx.fillStyle = gradient;
  roundRect(rectX, -doorH / 2, doorW, doorH, 4);
  ctx.fill();
  ctx.strokeStyle = shadeColor(color, -0.4);
  ctx.lineWidth = 1;
  roundRect(rectX, -doorH / 2, doorW, doorH, 4);
  ctx.stroke();

  ctx.fillStyle = 'rgba(190,220,235,0.55)';
  roundRect(rectX + doorW * 0.18, -doorH * 0.32, doorW * 0.64, doorH * 0.64, 3);
  ctx.fill();

  ctx.restore();
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

function isPedestrianNearForJump(p) {
  // Pedestrians aren't lane-locked, so "near" checks horizontal proximity to
  // the player (with a forgiving buffer, since they keep drifting sideways —
  // requiring an exact overlap at the instant you jump was too tight) plus
  // the same vertical timing used for cars.
  const pedRect = { x: p.x, y: zebraEvent.y + p.offsetY, width: p.width, height: p.height };
  const xBuffer = 40;
  const xNear = pedRect.x < player.x + player.width + xBuffer && pedRect.x + pedRect.width > player.x - xBuffer;
  const gapAhead = player.y - (pedRect.y + pedRect.height);
  return xNear && gapAhead <= JUMP_NEAR_RANGE && pedRect.y <= player.y + player.height;
}

function collectNearbyJumpTargets(includeBig) {
  const found = traffic.filter(
    (v) => (includeBig || v.size !== 'big') && v.lane === player.lane && !v.jumpCleared && isVehicleNearForJump(v)
  );
  if (zebraEvent) {
    for (const p of zebraEvent.pedestrians) {
      if (!p.jumpCleared && isPedestrianNearForJump(p)) {
        found.push(p);
      }
    }
  }
  return found;
}

function triggerJump() {
  if (gameState !== 'playing') return;

  if (!player.isJumping) {
    // First press: a normal jump. Only cars/pedestrians that are genuinely
    // close right now count as targets — big trucks/buses need the extra
    // height from a chained double jump to actually clear, so a single jump
    // alone doesn't lock onto them (they still get the usual mid-air
    // pass-through, but you must dodge lanes before landing on one).
    player.isJumping = true;
    player.jumpFrame = 0;
    player.doubleJumpActive = false;
    player.doubleJumpUsed = false;
    player.jumpTargets = new Set(collectNearbyJumpTargets(false));
    return;
  }

  if (!player.doubleJumpUsed) {
    // Second press before landing: chain into a bigger, higher double jump
    // that continues up from the current height instead of resetting to the
    // ground — and this extra height is what lets a big vehicle be cleared.
    player.doubleJumpUsed = true;
    player.doubleJumpActive = true;
    player.doubleJumpBase = currentJumpArc(player);
    player.doubleJumpFrames = DOUBLE_JUMP_FRAMES;
    player.jumpFrame = 0;

    for (const target of collectNearbyJumpTargets(true)) {
      player.jumpTargets.add(target);
    }
  }
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
    if (!howToPlayView.classList.contains('hidden')) {
      beginFirstGame();
    } else if (gameState === 'gameover' && settingsModal.classList.contains('hidden')) {
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
  howToPlayView.classList.add('hidden');
  welcomeMenuView.classList.remove('hidden');
  welcomeOverlay.classList.remove('hidden');
}

mainMenuBtn.addEventListener('click', returnToMainMenu);

function toggleFullscreen() {
  const inFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (inFullscreen) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    return;
  }

  try {
    const request = canvasContainer.requestFullscreen
      ? canvasContainer.requestFullscreen()
      : canvasContainer.webkitRequestFullscreen && canvasContainer.webkitRequestFullscreen();
    if (request && request.catch) {
      request.catch((e) => console.warn('Car Rush: could not enter fullscreen.', e));
    }
  } catch (e) {
    console.warn('Car Rush: could not enter fullscreen.', e);
  }
}

function updateFullscreenButtons() {
  const label = document.fullscreenElement || document.webkitFullscreenElement ? '🖥️ Exit Full Screen' : '🖥️ Full Screen';
  fullscreenBtn.textContent = label;
  welcomeFullscreenBtn.textContent = label;
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
welcomeFullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

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

function beginFirstGame() {
  hasSeenTutorial = true;
  try {
    localStorage.setItem(TUTORIAL_KEY, 'true');
  } catch (e) {
    console.warn('Car Rush: could not save tutorial-seen flag.', e);
  }
  howToPlayView.classList.add('hidden');
  welcomeOverlay.classList.add('hidden');
  overlay.classList.add('hidden');
  resetGame();
}

welcomeStartBtn.addEventListener('click', () => {
  if (hasSeenTutorial) {
    welcomeOverlay.classList.add('hidden');
    overlay.classList.add('hidden');
    resetGame();
    return;
  }
  welcomeMenuView.classList.add('hidden');
  howToPlayView.classList.remove('hidden');
});

howToPlayStartBtn.addEventListener('click', beginFirstGame);

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

  // Clear the saved name and tutorial flag so the next time this link is
  // opened — by anyone, on this browser — it starts over from scratch.
  currentUsername = '';
  hasSeenTutorial = false;
  try {
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(TUTORIAL_KEY);
  } catch (e) {
    console.warn('Car Rush: could not clear saved username.', e);
  }

  overlay.classList.add('hidden');
  settingsModal.classList.add('hidden');
  usernameView.classList.add('hidden');
  welcomeMenuView.classList.add('hidden');
  howToPlayView.classList.add('hidden');
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
