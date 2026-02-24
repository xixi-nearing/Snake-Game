const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const soundToggle = document.getElementById('soundToggle');
const gridToggle = document.getElementById('gridToggle');
const statusBadge = document.getElementById('statusBadge');
const seedDisplay = document.getElementById('seedDisplay');

const scoreDisplay = document.getElementById('scoreDisplay');
const bestDisplay = document.getElementById('bestDisplay');
const serverBestDisplay = document.getElementById('serverBestDisplay');
const levelDisplay = document.getElementById('levelDisplay');
const speedDisplay = document.getElementById('speedDisplay');
const multiplierDisplay = document.getElementById('multiplierDisplay');
const comboDisplay = document.getElementById('comboDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const timeDisplay = document.getElementById('timeDisplay');
const effectsList = document.getElementById('effectsList');
const skinSelect = document.getElementById('skinSelect');

const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));

const CONFIG = {
  cols: 28,
  rows: 28,
  baseSpeed: 7,
  maxSpeed: 18,
  comboWindow: 2400,
  timeLimit: 90,
  bonusTime: 6,
  magnetRadius: 6,
  growthBase: 1,
};

const STORAGE_KEY = 'neonSnakeDataV1';

const ITEM_DEFS = {
  food: { score: 10, grow: 1, ttl: Infinity, color: '#24f6ff' },
  bonus: { score: 25, grow: 2, ttl: 6000, color: '#ff3df0' },
  toxic: { score: -15, grow: -2, ttl: 7000, color: '#ff5978' },
  power: { score: 12, grow: 0, ttl: 7000, color: '#4bff88' },
};

const SKINS = {
  neon: { base: 190, spread: 140, sat: 92, light: 60, shimmer: 0.35 },
  ocean: { base: 200, spread: 70, sat: 85, light: 55, shimmer: 0.18 },
  forest: { base: 115, spread: 80, sat: 70, light: 50, shimmer: 0.12 },
};

const PARTICLE_STYLES = {
  food: { type: 'spark', count: [8, 12], size: [0.1, 0.16], life: [260, 420], speed: [0.02, 0.045], alpha: 0.6 },
  bonus: { type: 'star', count: [12, 16], size: [0.16, 0.22], life: [380, 560], speed: [0.03, 0.06], alpha: 0.75 },
  power: { type: 'petal', count: [10, 14], size: [0.18, 0.26], life: [480, 720], speed: [0.02, 0.045], alpha: 0.55 },
  toxic: { type: 'leaf', count: [8, 12], size: [0.18, 0.28], life: [520, 820], speed: [0.015, 0.035], alpha: 0.5 },
  rainbow: { type: 'orb', count: [14, 18], size: [0.14, 0.22], life: [420, 720], speed: [0.02, 0.05], alpha: 0.7 },
};

const POWER_TYPES = [
  { id: 'speed', label: '超频', duration: 6500, color: '#00f5ff' },
  { id: 'slow', label: '缓流', duration: 6500, color: '#7b5cff' },
  { id: 'shield', label: '护盾', duration: 9000, color: '#ffe66d' },
  { id: 'ghost', label: '幽影', duration: 6500, color: '#f99dff' },
  { id: 'magnet', label: '磁力场', duration: 6500, color: '#4bff88' },
  { id: 'multiplier', label: '倍增', duration: 7500, color: '#ff3df0' },
  { id: 'rainbow', label: '虹蛇', duration: 15000, color: '#ffd166' },
];

let rngSeed = Date.now() % 100000;

const audio = {
  ctx: null,
  enabled: true,
};

const state = {
  running: false,
  paused: false,
  mode: 'classic',
  score: 0,
  level: 1,
  lives: 0,
  timeLeft: 0,
  combo: 0,
  comboTimer: 0,
  multiplier: 1,
  growth: 0,
  effects: {
    speed: 0,
    slow: 0,
    ghost: 0,
    magnet: 0,
    multiplier: 0,
    rainbow: 0,
  },
  shield: 0,
  portalCooldown: 0,
  stepCount: 0,
};

let cellSize = 20;
let canvasSize = 0;
let snake = [];
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let items = [];
let obstacles = [];
let movers = [];
let portals = [];
let particles = [];
let specialTimers = {
  bonus: 0,
  toxic: 0,
  power: 0,
};

let lastTime = 0;
let accumulator = 0;
let rafId = null;
let dataStore = loadStore();
let serverStats = null;

function init() {
  rngSeed = dataStore.seed || rngSeed;
  seedDisplay.textContent = `SEED: ${String(rngSeed).padStart(4, '0')}`;

  soundToggle.checked = dataStore.settings.sound;
  gridToggle.checked = dataStore.settings.grid;
  setMode(dataStore.settings.mode || 'classic');
  skinSelect.value = dataStore.settings.skin || 'neon';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  startBtn.addEventListener('click', () => {
    initAudio();
    startGame();
  });

  pauseBtn.addEventListener('click', togglePause);
  resetBtn.addEventListener('click', () => resetGame(false));
  clearDataBtn.addEventListener('click', clearData);

  soundToggle.addEventListener('change', () => {
    dataStore.settings.sound = soundToggle.checked;
    audio.enabled = soundToggle.checked;
    persistStore();
  });

  gridToggle.addEventListener('change', () => {
    dataStore.settings.grid = gridToggle.checked;
    persistStore();
  });

  skinSelect.addEventListener('change', () => {
    dataStore.settings.skin = skinSelect.value;
    persistStore();
  });

  modeInputs.forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        setMode(event.target.value);
      }
    });
  });

  document.addEventListener('keydown', handleKeydown);

  resetGame(false);
  render();
  rafId = requestAnimationFrame(loop);
  fetchServerStats();
}

function loadStore() {
  const fallback = {
    settings: { sound: true, grid: true, mode: 'classic', skin: 'neon' },
    best: { classic: 0, survival: 0, time: 0 },
    maxLevel: 1,
    seed: rngSeed,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return {
      settings: { ...fallback.settings, ...(data.settings || {}) },
      best: { ...fallback.best, ...(data.best || {}) },
      maxLevel: data.maxLevel || 1,
      seed: data.seed || rngSeed,
    };
  } catch (error) {
    return fallback;
  }
}

function persistStore() {
  dataStore.seed = rngSeed;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataStore));
}

function clearData() {
  localStorage.removeItem(STORAGE_KEY);
  dataStore = loadStore();
  setMode('classic');
}

function setMode(mode) {
  state.mode = mode;
  dataStore.settings.mode = mode;
  modeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
  persistStore();
  resetGame(false);
  updateServerBest();
}

function resetGame(keepOverlay) {
  state.running = false;
  state.paused = false;
  state.score = 0;
  state.level = 1;
  state.combo = 0;
  state.comboTimer = 0;
  state.multiplier = 1;
  state.effects = { speed: 0, slow: 0, ghost: 0, magnet: 0, multiplier: 0, rainbow: 0 };
  state.shield = 0;
  state.portalCooldown = 0;
  state.stepCount = 0;
  state.growth = 0;
  state.lives = state.mode === 'survival' ? 3 : 0;
  state.timeLeft = state.mode === 'time' ? CONFIG.timeLimit : 0;

  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };

  snake = createSnake();
  items = [];
  obstacles = [];
  movers = [];
  portals = [];
  particles = [];
  specialTimers = {
    bonus: 1800,
    toxic: 2400,
    power: 2800,
  };

  buildLevel();
  ensureFood();
  updateHUD();

  if (!keepOverlay) {
    showOverlay('READY', '启动', '准备就绪，点击启动开始。');
  }
  setStatus('READY');
}

function startGame() {
  if (!state.running) {
    resetGame(true);
  }
  state.running = true;
  state.paused = false;
  hideOverlay();
  setStatus('RUNNING');
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) {
    showOverlay('PAUSED', '继续', '暂停中，点击继续或空格恢复。');
    setStatus('PAUSED');
  } else {
    hideOverlay();
    setStatus('RUNNING');
  }
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  if (key === ' ') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (key === 'escape') {
    event.preventDefault();
    togglePause();
    return;
  }
  if (key === 'r') {
    resetGame(false);
    return;
  }

  const dirMap = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };

  if (dirMap[key]) {
    const proposed = dirMap[key];
    if (!isOpposite(proposed, direction)) {
      nextDirection = proposed;
    }
  }
}

function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function loop(timestamp) {
  const delta = timestamp - lastTime;
  lastTime = timestamp;

  if (state.running && !state.paused) {
    const speed = getCurrentSpeed();
    const stepMs = 1000 / speed;
    accumulator += delta;

    while (accumulator >= stepMs) {
      update(stepMs);
      accumulator -= stepMs;
    }
  }

  render();
  rafId = requestAnimationFrame(loop);
}

function update(stepMs) {
  state.stepCount += 1;
  updateEffects(stepMs);
  updateCombo(stepMs);
  updateTime(stepMs);
  updateLevel();
  updateItems(stepMs);
  updateParticles(stepMs);
  updateMovers();
  moveSnake();
  emitRainbowTrail();
  updateHUD();
}

function updateEffects(stepMs) {
  Object.keys(state.effects).forEach((key) => {
    if (state.effects[key] > 0) {
      state.effects[key] = Math.max(0, state.effects[key] - stepMs);
    }
  });
}

function updateCombo(stepMs) {
  if (state.comboTimer > 0) {
    state.comboTimer = Math.max(0, state.comboTimer - stepMs);
    if (state.comboTimer === 0) {
      state.combo = 0;
    }
  }

  const comboTier = Math.min(3, Math.floor(state.combo / 2));
  const powerBoost = state.effects.multiplier > 0 ? 1 : 0;
  state.multiplier = 1 + comboTier + powerBoost;
}

function updateTime(stepMs) {
  if (state.mode !== 'time') return;
  state.timeLeft = Math.max(0, state.timeLeft - stepMs / 1000);
  if (state.timeLeft === 0) {
    gameOver('时间到');
  }
}

function updateLevel() {
  const nextLevel = Math.min(20, 1 + Math.floor(state.score / 220));
  if (nextLevel !== state.level) {
    state.level = nextLevel;
    dataStore.maxLevel = Math.max(dataStore.maxLevel, state.level);
    persistStore();
    buildLevel();
    pulseScreen();
    playTone(860, 0.12, 'sawtooth', 0.08);
  }
}

function updateItems(stepMs) {
  items = items.filter((item) => {
    if (item.ttl === Infinity) return true;
    item.ttl -= stepMs;
    return item.ttl > 0;
  });

  const specials = items.filter((item) => item.kind !== 'food');
  const limit = Math.min(4, 1 + Math.floor(state.level / 3));

  Object.keys(specialTimers).forEach((key) => {
    specialTimers[key] -= stepMs;
    if (specialTimers[key] <= 0 && specials.length < limit) {
      spawnSpecial(key);
      specialTimers[key] = randRange(2800, 5200);
    }
  });

  ensureFood();

  if (state.effects.magnet > 0) {
    applyMagnet();
  }
}

function updateParticles(stepMs) {
  particles.forEach((particle) => {
    particle.life -= stepMs;
    particle.vy += particle.gravity * stepMs;
    particle.x += particle.vx * stepMs;
    particle.y += particle.vy * stepMs;
    particle.rotation += particle.spin * stepMs;
  });
  particles = particles.filter((particle) => particle.life > 0);
}

function updateMovers() {
  if (state.stepCount % 2 !== 0) return;
  movers.forEach((mover) => {
    const nextX = mover.x + mover.dx;
    const nextY = mover.y + mover.dy;
    if (isBlocked(nextX, nextY, true)) {
      mover.dx *= -1;
      mover.dy *= -1;
    } else {
      mover.x = nextX;
      mover.y = nextY;
    }
  });
}

function moveSnake() {
  direction = nextDirection;
  let newX = snake[0].x + direction.x;
  let newY = snake[0].y + direction.y;

  if (state.effects.ghost > 0) {
    newX = (newX + CONFIG.cols) % CONFIG.cols;
    newY = (newY + CONFIG.rows) % CONFIG.rows;
  } else if (isOutside(newX, newY)) {
    handleHit('wall');
    return;
  }

  if (state.portalCooldown > 0) {
    state.portalCooldown -= 1;
  }

  if (state.portalCooldown === 0) {
    const portal = findPortal(newX, newY);
    if (portal) {
      newX = portal.x;
      newY = portal.y;
      state.portalCooldown = 3;
      playTone(620, 0.08, 'triangle', 0.06);
    }
  }

  const hitSelf = isOnSnake(newX, newY, true);
  const hitObstacle = isObstacle(newX, newY);
  const hitMover = movers.some((mover) => mover.x === newX && mover.y === newY);

  if (!state.effects.ghost && (hitSelf || hitObstacle || hitMover)) {
    handleHit('impact');
    return;
  }

  const newHead = { x: newX, y: newY };
  snake.unshift(newHead);

  const itemIndex = items.findIndex((item) => item.x === newX && item.y === newY);
  if (itemIndex >= 0) {
    const item = items[itemIndex];
    items.splice(itemIndex, 1);
    applyItem(item);
  } else if (state.growth > 0) {
    state.growth -= 1;
  } else {
    snake.pop();
  }
}

function applyItem(item) {
  const def = ITEM_DEFS[item.kind];
  spawnParticles(item);
  const baseScore = def.score;
  if (baseScore > 0) {
    if (state.comboTimer > 0) {
      state.combo += 1;
    } else {
      state.combo = 1;
    }
    state.comboTimer = CONFIG.comboWindow;
  } else {
    state.combo = 0;
    state.comboTimer = 0;
  }

  const comboTier = Math.min(3, Math.floor(state.combo / 2));
  const powerBoost = state.effects.multiplier > 0 ? 1 : 0;
  const multiplier = 1 + comboTier + powerBoost;
  state.multiplier = multiplier;
  const scoreDelta = baseScore > 0 ? Math.floor(baseScore * multiplier) : baseScore;
  state.score = Math.max(0, state.score + scoreDelta);

  if (def.grow > 0) {
    state.growth += def.grow;
  }
  if (def.grow < 0) {
    shrinkSnake(Math.abs(def.grow));
  }

  if (item.kind === 'bonus' && state.mode === 'time') {
    state.timeLeft += CONFIG.bonusTime;
  }

  if (item.kind === 'power') {
    activatePower(item.powerType);
  } else {
    playTone(item.kind === 'toxic' ? 220 : 520, 0.08, 'square', 0.07);
  }
}

function activatePower(powerId) {
  const power = POWER_TYPES.find((p) => p.id === powerId);
  if (!power) return;

  if (power.id === 'shield') {
    state.shield = Math.min(3, state.shield + 1);
  } else {
    state.effects[power.id] = Math.max(state.effects[power.id], power.duration);
  }

  playTone(740, 0.12, 'sawtooth', 0.09);
}

function handleHit() {
  if (state.shield > 0) {
    state.shield -= 1;
    pulseScreen();
    playTone(330, 0.12, 'triangle', 0.07);
    return;
  }

  if (state.mode === 'survival') {
    state.lives -= 1;
    if (state.lives > 0) {
      respawnSnake();
      playTone(260, 0.12, 'square', 0.06);
      return;
    }
  }

  gameOver('撞击');
}

function respawnSnake() {
  snake = createSnake();
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  state.growth = 0;
}

function gameOver(reason) {
  state.running = false;
  state.paused = false;
  setStatus('GAME OVER');
  showOverlay(reason, '再来', '点击启动重新开始。');
  updateBest();
  sendScoreToServer();
  playTone(180, 0.3, 'sine', 0.08);
}

function updateBest() {
  const currentBest = dataStore.best[state.mode] || 0;
  if (state.score > currentBest) {
    dataStore.best[state.mode] = state.score;
    persistStore();
  }
}

function updateHUD() {
  scoreDisplay.textContent = state.score;
  bestDisplay.textContent = dataStore.best[state.mode] || 0;
  updateServerBest();
  levelDisplay.textContent = state.level;
  speedDisplay.textContent = getCurrentSpeed().toFixed(1);
  multiplierDisplay.textContent = `${state.multiplier}x`;
  comboDisplay.textContent = state.combo;
  livesDisplay.textContent = state.mode === 'survival' ? state.lives : '-';
  timeDisplay.textContent = state.mode === 'time' ? formatTime(state.timeLeft) : '-';
  renderEffects();
}

function renderEffects() {
  const active = [];

  POWER_TYPES.forEach((power) => {
    if (power.id === 'shield') {
      if (state.shield > 0) {
        active.push({ label: `护盾 x${state.shield}`, time: '--' });
      }
    } else if (state.effects[power.id] > 0) {
      active.push({
        label: power.label,
        time: `${Math.ceil(state.effects[power.id] / 1000)}s`,
      });
    }
  });

  effectsList.innerHTML = '';
  if (!active.length) {
    const empty = document.createElement('div');
    empty.className = 'effect effect--empty';
    empty.textContent = '尚未激活';
    effectsList.appendChild(empty);
    return;
  }

  active.forEach((effect) => {
    const row = document.createElement('div');
    row.className = 'effect effect--active';
    row.innerHTML = `<span>${effect.label}</span><strong>${effect.time}</strong>`;
    effectsList.appendChild(row);
  });
}

function getCurrentSpeed() {
  let speed = CONFIG.baseSpeed + (state.level - 1) * 0.6;
  if (state.effects.speed > 0) speed += 3.5;
  if (state.effects.slow > 0) speed -= 2.5;
  speed = Math.max(4, Math.min(CONFIG.maxSpeed, speed));
  return speed;
}

function buildLevel() {
  obstacles = [];
  movers = [];
  portals = [];
  items = [];

  const obstacleCount = Math.min(40, 5 + state.level * 2);
  const moverCount = Math.min(6, Math.floor(state.level / 3));
  const portalPairs = state.level >= 3 ? 1 + Math.floor((state.level - 3) / 4) : 0;

  let occupied = new Set();
  snake.forEach((seg) => occupied.add(cellKey(seg.x, seg.y)));
  const centerX = Math.floor(CONFIG.cols / 2);
  const centerY = Math.floor(CONFIG.rows / 2);
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dy = -2; dy <= 2; dy += 1) {
      const safeX = centerX + dx;
      const safeY = centerY + dy;
      if (!isOutside(safeX, safeY)) {
        occupied.add(cellKey(safeX, safeY));
      }
    }
  }

  for (let i = 0; i < obstacleCount; i += 1) {
    const cell = randomEmptyCell(occupied);
    if (!cell) break;
    obstacles.push(cell);
    occupied.add(cellKey(cell.x, cell.y));
  }

  for (let i = 0; i < moverCount; i += 1) {
    const cell = randomEmptyCell(occupied);
    if (!cell) break;
    const dir = randomDirection();
    movers.push({ ...cell, dx: dir.x, dy: dir.y });
    occupied.add(cellKey(cell.x, cell.y));
  }

  for (let i = 0; i < portalPairs; i += 1) {
    const first = randomEmptyCell(occupied);
    if (!first) break;
    occupied.add(cellKey(first.x, first.y));
    const second = randomEmptyCell(occupied);
    if (!second) break;
    occupied.add(cellKey(second.x, second.y));
    portals.push({ a: first, b: second });
  }
}

function ensureFood() {
  const hasFood = items.some((item) => item.kind === 'food');
  if (!hasFood) {
    spawnItem('food');
  }
}

function spawnSpecial(kind) {
  if (kind === 'power') {
    const power = randomChoice(POWER_TYPES);
    spawnItem('power', power.id);
  } else if (kind === 'bonus') {
    spawnItem('bonus');
  } else if (kind === 'toxic') {
    spawnItem('toxic');
  }
}

function spawnItem(kind, powerType) {
  const occupied = getOccupiedSet();
  const cell = randomEmptyCell(occupied);
  if (!cell) return;
  const def = ITEM_DEFS[kind];
  items.push({
    x: cell.x,
    y: cell.y,
    kind,
    powerType: powerType || null,
    ttl: def.ttl,
  });
}

function spawnParticles(item) {
  const style =
    item.kind === 'power' && item.powerType === 'rainbow'
      ? PARTICLE_STYLES.rainbow
      : PARTICLE_STYLES[item.kind];
  if (!style) return;
  const centerX = item.x * cellSize + cellSize / 2;
  const centerY = item.y * cellSize + cellSize / 2;
  const count = randRange(style.count[0], style.count[1]);
  const fallbackColor = ITEM_DEFS[item.kind]?.color || '#ffffff';
  const angleRange = style.type === 'leaf' ? Math.PI : Math.PI * 2;
  const angleOffset = 0;

  for (let i = 0; i < count; i += 1) {
    const angle = randFloat(angleOffset, angleOffset + angleRange);
    const speed = randFloat(style.speed[0], style.speed[1]) * cellSize;
    const size = randFloat(style.size[0], style.size[1]) * cellSize;
    const life = randRange(style.life[0], style.life[1]);
    const color = style.type === 'orb' ? rainbowColor(i * 25 + state.stepCount * 6) : fallbackColor;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.15,
      size,
      type: style.type,
      color,
      life,
      maxLife: life,
      alpha: style.alpha,
      rotation: randFloat(0, Math.PI * 2),
      spin: randFloat(-0.006, 0.006),
      gravity: style.type === 'leaf' ? 0.00035 : 0.0002,
    });
  }

  if (particles.length > 400) {
    particles.splice(0, particles.length - 400);
  }
}

function emitRainbowTrail() {
  if (state.effects.rainbow <= 0 || !snake.length) return;
  const head = snake[0];
  const centerX = head.x * cellSize + cellSize / 2;
  const centerY = head.y * cellSize + cellSize / 2;
  const count = 3;

  for (let i = 0; i < count; i += 1) {
    const angle = randFloat(0, Math.PI * 2);
    const speed = randFloat(0.01, 0.03) * cellSize;
    const size = randFloat(0.08, 0.14) * cellSize;
    const life = randRange(260, 460);
    const hue = (state.stepCount * 8 + i * 40 + randRange(0, 80)) % 360;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.1,
      size,
      type: 'orb',
      color: `hsl(${hue}, 90%, 65%)`,
      life,
      maxLife: life,
      alpha: 0.45,
      rotation: 0,
      spin: 0,
      gravity: 0.00015,
    });
  }

  if (particles.length > 400) {
    particles.splice(0, particles.length - 400);
  }
}

function getOccupiedSet() {
  const occupied = new Set();
  snake.forEach((seg) => occupied.add(cellKey(seg.x, seg.y)));
  obstacles.forEach((obs) => occupied.add(cellKey(obs.x, obs.y)));
  movers.forEach((mover) => occupied.add(cellKey(mover.x, mover.y)));
  items.forEach((item) => occupied.add(cellKey(item.x, item.y)));
  portals.forEach((portal) => {
    occupied.add(cellKey(portal.a.x, portal.a.y));
    occupied.add(cellKey(portal.b.x, portal.b.y));
  });
  return occupied;
}

function applyMagnet() {
  items.forEach((item) => {
    if (item.kind === 'toxic') return;
    const distance = Math.abs(item.x - snake[0].x) + Math.abs(item.y - snake[0].y);
    if (distance > CONFIG.magnetRadius) return;

    const dx = Math.sign(snake[0].x - item.x);
    const dy = Math.sign(snake[0].y - item.y);
    const nextX = item.x + dx;
    const nextY = item.y + dy;

    if (isOutside(nextX, nextY)) return;
    if (isCellOccupied(nextX, nextY, item)) return;

    item.x = nextX;
    item.y = nextY;
  });
}

function isCellOccupied(x, y, ignoreItem) {
  if (snake.some((seg) => seg.x === x && seg.y === y)) return true;
  if (obstacles.some((obs) => obs.x === x && obs.y === y)) return true;
  if (movers.some((mover) => mover.x === x && mover.y === y)) return true;
  if (portals.some((portal) => (portal.a.x === x && portal.a.y === y) || (portal.b.x === x && portal.b.y === y))) {
    return true;
  }
  if (items.some((item) => item !== ignoreItem && item.x === x && item.y === y)) return true;
  return false;
}

function isOnSnake(x, y, ignoreHead) {
  return snake.some((seg, index) => (ignoreHead ? index > 0 : true) && seg.x === x && seg.y === y);
}

function isObstacle(x, y) {
  return obstacles.some((obs) => obs.x === x && obs.y === y);
}

function isOutside(x, y) {
  return x < 0 || y < 0 || x >= CONFIG.cols || y >= CONFIG.rows;
}

function isBlocked(x, y, forMover) {
  if (isOutside(x, y)) return true;
  if (isObstacle(x, y)) return true;
  if (forMover && portals.some((portal) => (portal.a.x === x && portal.a.y === y) || (portal.b.x === x && portal.b.y === y))) {
    return true;
  }
  if (forMover && movers.some((mover) => mover.x === x && mover.y === y)) {
    return true;
  }
  return false;
}

function findPortal(x, y) {
  for (const portal of portals) {
    if (portal.a.x === x && portal.a.y === y) return portal.b;
    if (portal.b.x === x && portal.b.y === y) return portal.a;
  }
  return null;
}

function createSnake() {
  const centerX = Math.floor(CONFIG.cols / 2);
  const centerY = Math.floor(CONFIG.rows / 2);
  return [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY },
  ];
}

function shrinkSnake(count) {
  for (let i = 0; i < count; i += 1) {
    if (snake.length > 3) {
      snake.pop();
    }
  }
}

function randomEmptyCell(occupied) {
  for (let i = 0; i < 120; i += 1) {
    const x = randInt(0, CONFIG.cols - 1);
    const y = randInt(0, CONFIG.rows - 1);
    const key = cellKey(x, y);
    if (!occupied.has(key)) {
      return { x, y };
    }
  }
  return null;
}

function randomDirection() {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  return randomChoice(dirs);
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randRange(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return rand() * (max - min) + min;
}

function rand() {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}

function rainbowColor(hue) {
  const normalized = ((hue % 360) + 360) % 360;
  return `hsl(${normalized}, 90%, 62%)`;
}

function getSkinConfig() {
  return SKINS[dataStore.settings.skin] || SKINS.neon;
}

function skinColor(ratio) {
  const skin = getSkinConfig();
  const hue = (skin.base + skin.spread * ratio + skin.shimmer * state.stepCount) % 360;
  return `hsl(${hue}, ${skin.sat}%, ${skin.light}%)`;
}

function randomChoice(list) {
  return list[Math.floor(rand() * list.length)];
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cellSize = size / CONFIG.cols;
  canvasSize = size;
}

function render() {
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  drawBackground();
  if (gridToggle.checked) {
    drawGrid();
  }
  drawPortals();
  drawObstacles();
  drawMovers();
  drawItems();
  drawParticles();
  drawSnake();
}

function drawBackground() {
  ctx.save();
  const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
  gradient.addColorStop(0, 'rgba(8, 12, 30, 0.9)');
  gradient.addColorStop(1, 'rgba(4, 6, 18, 0.9)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= CONFIG.cols; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, CONFIG.rows * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= CONFIG.rows; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(CONFIG.cols * cellSize, y * cellSize);
    ctx.stroke();
  }
  ctx.restore();
}

function drawItems() {
  items.forEach((item) => {
    const def = ITEM_DEFS[item.kind];
    const radius = cellSize * 0.28;
    const x = item.x * cellSize + cellSize / 2;
    const y = item.y * cellSize + cellSize / 2;
    ctx.save();
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const lifeRatio = Math.max(0, particle.life / particle.maxLife);
    const alpha = particle.alpha * lifeRatio;
    if (alpha <= 0) return;

    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = particle.color;

    if (particle.type === 'spark') {
      drawSpark(particle.size);
    } else if (particle.type === 'star') {
      drawStar(particle.size, particle.size * 0.45, 5);
    } else if (particle.type === 'petal') {
      drawPetal(particle.size);
    } else if (particle.type === 'orb') {
      drawOrb(particle.size);
    } else if (particle.type === 'leaf') {
      drawLeaf(particle.size);
    }

    ctx.restore();
  });
}

function drawStar(outerRadius, innerRadius, points) {
  const step = Math.PI / points;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
}

function drawSpark(size) {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.35, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.35, 0);
  ctx.closePath();
  ctx.fill();
}

function drawPetal(size) {
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.4, size, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrb(size) {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawLeaf(size) {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.7, -size * 0.2, 0, size);
  ctx.quadraticCurveTo(-size * 0.7, -size * 0.2, 0, -size);
  ctx.closePath();
  ctx.fill();
}

function drawObstacles() {
  obstacles.forEach((obs) => {
    drawGlowRect(obs.x, obs.y, '#7b5cff', 0.15, 0.85);
  });
}

function drawMovers() {
  movers.forEach((mover) => {
    drawGlowDiamond(mover.x, mover.y, '#f99dff');
  });
}

function drawPortals() {
  portals.forEach((portal) => {
    drawPortalCell(portal.a.x, portal.a.y);
    drawPortalCell(portal.b.x, portal.b.y);
  });
}

function drawPortalCell(x, y) {
  const centerX = x * cellSize + cellSize / 2;
  const centerY = y * cellSize + cellSize / 2;
  ctx.save();
  ctx.strokeStyle = '#7b5cff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#7b5cff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(centerX, centerY, cellSize * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSnake() {
  const rainbowActive = state.effects.rainbow > 0;
  snake.forEach((seg, index) => {
    if (rainbowActive) {
      const hue = (index * 22 + state.stepCount * 6) % 360;
      const color = rainbowColor(hue);
      drawGlowRect(seg.x, seg.y, color, 0.08, index === 0 ? 1 : 0.8);
    } else {
      const ratio = snake.length > 1 ? index / (snake.length - 1) : 0;
      const color = skinColor(ratio);
      drawGlowRect(seg.x, seg.y, color, 0.1, index === 0 ? 1 : 0.7);
    }
  });

  drawEyes();
}

function drawEyes() {
  const head = snake[0];
  const eyeOffset = cellSize * 0.2;
  ctx.save();
  ctx.fillStyle = '#0b0f1f';
  ctx.beginPath();
  ctx.arc(head.x * cellSize + cellSize / 2 + eyeOffset, head.y * cellSize + cellSize / 2 - eyeOffset, cellSize * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(head.x * cellSize + cellSize / 2 - eyeOffset, head.y * cellSize + cellSize / 2 - eyeOffset, cellSize * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlowRect(x, y, color, paddingFactor, alpha) {
  const size = cellSize * (1 - paddingFactor * 2);
  const padding = cellSize * paddingFactor;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(x * cellSize + padding, y * cellSize + padding, size, size);
  ctx.restore();
}

function drawGlowDiamond(x, y, color) {
  const centerX = x * cellSize + cellSize / 2;
  const centerY = y * cellSize + cellSize / 2;
  const r = cellSize * 0.35;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - r);
  ctx.lineTo(centerX + r, centerY);
  ctx.lineTo(centerX, centerY + r);
  ctx.lineTo(centerX - r, centerY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function showOverlay(label, buttonText, subtitle) {
  overlay.querySelector('h1').textContent = label;
  overlay.querySelector('p').textContent = subtitle || '点击“启动”或空格继续战斗。';
  overlay.querySelector('button').textContent = buttonText;
  overlay.style.display = 'flex';
}

function hideOverlay() {
  overlay.style.display = 'none';
}

function setStatus(text) {
  statusBadge.textContent = text;
}

function pulseScreen() {
  canvas.parentElement.animate(
    [{ boxShadow: '0 0 45px rgba(255, 61, 240, 0.4)' }, { boxShadow: '0 0 0 rgba(0,0,0,0)' }],
    { duration: 400, easing: 'ease-out' }
  );
}

function formatTime(seconds) {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

async function fetchServerStats() {
  try {
    const response = await fetch('/api/stats', { cache: 'no-store' });
    if (!response.ok) throw new Error('bad response');
    const payload = await response.json();
    serverStats = payload;
    updateServerBest();
  } catch (error) {
    serverStats = null;
    serverBestDisplay.textContent = '-';
  }
}

async function sendScoreToServer() {
  if (!state.score || state.score <= 0) return;
  try {
    const response = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: state.mode,
        score: state.score,
        level: state.level,
        duration: state.stepCount,
      }),
    });
    if (!response.ok) throw new Error('bad response');
    const payload = await response.json();
    serverStats = payload;
    updateServerBest();
  } catch (error) {
    serverStats = null;
    serverBestDisplay.textContent = '-';
  }
}

function updateServerBest() {
  if (!serverBestDisplay) return;
  if (!serverStats || !serverStats.best) {
    serverBestDisplay.textContent = '-';
    return;
  }
  const best = serverStats.best[state.mode];
  serverBestDisplay.textContent = typeof best === 'number' ? best : '-';
}

function initAudio() {
  if (audio.ctx) return;
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.enabled = soundToggle.checked;
}

function playTone(freq, duration, type, gainValue) {
  if (!audio.enabled || !audio.ctx) return;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain).connect(audio.ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);
  osc.stop(audio.ctx.currentTime + duration);
}

init();
