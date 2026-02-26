import {
  CONFIG,
  CONTRACT_POOL,
  DIR_VECTORS,
  ITEM_DEFS,
  PARTICLE_STYLES,
  POWER_TYPES,
  PROTOCOLS,
  SKINS,
  SPECIAL_TIMER_RANGES,
  STORAGE_KEY,
  UPGRADES,
} from "./config.js";
import { getDom } from "./dom.js";
import { createAudioController } from "./audio.js";
import { createInputController } from "./input.js";
import { createNavigation } from "./navigation.js";
import {
  clearStore as clearStoreData,
  loadStore as loadStoreData,
  loadLastUsername,
  persistLastUsername,
  persistStore as persistStoreData,
} from "./storage.js";

const dom = getDom();
const {
  canvas,
  ctx,
  overlay,
  startBtn,
  pauseBtn,
  clearDataBtn,
  soundToggle,
  gridToggle,
  statusBadge,
  seedDisplay,
  usernameInput,
  loginBtn,
  loginStatus,
  scoreDisplay,
  bestDisplay,
  serverBestDisplay,
  levelDisplay,
  speedDisplay,
  multiplierDisplay,
  comboDisplay,
  livesDisplay,
  timeDisplay,
  effectsList,
  skinSelect,
  contractsList,
  shardDisplay,
  upgradesList,
  modeInputs,
  protocolInputs,
} = dom;

const navigation = createNavigation({ pageButtons: dom.pageButtons, pages: dom.pages });
const audio = createAudioController();
let inputController = null;

let rngSeed = Date.now() % 100000;
const USERNAME_RE = /^[A-Za-z0-9_-]+$/;
const USERNAME_MAX = 32;

const state = {
  running: false,
  paused: false,
  mode: 'classic',
  protocol: 'steady',
  inputMode: 'keyboard',
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
  runShards: 0,
  contracts: [],
  contractsDirty: true,
  shopDirty: true,
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
let ripples = [];
let specialTimers = {
  bonus: 0,
  toxic: 0,
  power: 0,
  relic: 0,
};

let lastTime = 0;
let accumulator = 0;
let rafId = null;
let dataStore = null;
let currentUser = '';
let loginBusy = false;
let serverStats = null;
let resizeObserver = null;

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > USERNAME_MAX) return '';
  if (!USERNAME_RE.test(trimmed)) return '';
  return trimmed;
}

function setLoginStatus(message, tone = '') {
  loginStatus.textContent = message;
  loginStatus.classList.remove('is-success', 'is-error', 'is-warn');
  if (tone) {
    loginStatus.classList.add(`is-${tone}`);
  }
}

function setLoginBusyState(isBusy) {
  loginBusy = isBusy;
  usernameInput.disabled = isBusy;
  loginBtn.disabled = isBusy;
  loginBtn.textContent = isBusy ? '处理中' : '登录';
}

function applyStoreSettings() {
  rngSeed = dataStore.seed || rngSeed;
  seedDisplay.textContent = `SEED: ${String(rngSeed).padStart(4, '0')}`;
  soundToggle.checked = dataStore.settings.sound;
  gridToggle.checked = dataStore.settings.grid;
  setMode(dataStore.settings.mode || 'classic', true);
  setProtocol(dataStore.settings.protocol || 'steady', true);
  skinSelect.value = dataStore.settings.skin || 'neon';
}

function syncInputMode() {
  if (inputController) {
    inputController.setInputMode(inputController.resolveInputMode(), true);
  }
}

async function loginUser(username, { silent = false, deferUi = false } = {}) {
  if (loginBusy) return false;
  const normalized = normalizeUsername(username);
  if (!normalized) {
    usernameInput.classList.add('is-error');
    setLoginStatus('用户名仅支持数字、字母、-、_，且长度不超过32', 'error');
    return false;
  }

  usernameInput.classList.remove('is-error');
  setLoginBusyState(true);
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalized }),
    });
    if (!response.ok) throw new Error('bad response');
    const payload = await response.json();
    currentUser = normalized;
    persistLastUsername(normalized);
    dataStore = await loadStore();
    if (!deferUi) {
      applyStoreSettings();
      syncInputMode();
      resetGame(false);
    }
    if (!silent) {
      const statusText = payload.status === 'new' ? `已注册：${normalized}` : `欢迎回来：${normalized}`;
      setLoginStatus(statusText, 'success');
    } else {
      setLoginStatus(`已登录：${normalized}`, 'success');
    }
    fetchServerStats();
    return true;
  } catch (error) {
    setLoginStatus('登录失败，请稍后重试', 'error');
    return false;
  } finally {
    setLoginBusyState(false);
  }
}

async function restoreUserSession() {
  const saved = loadLastUsername();
  if (saved) {
    usernameInput.value = saved;
    const success = await loginUser(saved, { silent: true, deferUi: true });
    if (!success) {
      setLoginStatus('未登录，仅本地保存', 'warn');
    }
  } else {
    setLoginStatus('未登录，仅本地保存', 'warn');
  }
}

async function init() {
  loginBtn.addEventListener('click', () => {
    void loginUser(usernameInput.value);
  });
  usernameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void loginUser(usernameInput.value);
    }
  });
  usernameInput.addEventListener('input', () => {
    usernameInput.classList.remove('is-error');
  });

  await restoreUserSession();
  if (!dataStore) {
    dataStore = await loadStore();
  }
  applyStoreSettings();

  inputController = createInputController({
    dom,
    state,
    applyDirection,
    togglePause,
    resetGame,
    getStoredMode: () => dataStore.settings.inputMode,
    setStoredMode: (mode) => {
      dataStore.settings.inputMode = mode;
      persistStore();
    },
  });
  inputController.setInputMode(inputController.resolveInputMode(), true);
  navigation.setActivePage('main', true);
  navigation.bind();
  inputController.bind();

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeCanvas);
  }
  if (!resizeObserver && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas.parentElement);
  }

  startBtn.addEventListener('click', () => {
    initAudio();
    startGame();
  });

  pauseBtn.addEventListener('click', togglePause);
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', () => void clearData());
  }

  soundToggle.addEventListener('change', () => {
    dataStore.settings.sound = soundToggle.checked;
    audio.setEnabled(soundToggle.checked);
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

  protocolInputs.forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        setProtocol(event.target.value);
      }
    });
  });

  upgradesList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-upgrade]');
    if (button) {
      purchaseUpgrade(button.dataset.upgrade);
    }
  });

  resetGame(false);
  render();
  rafId = requestAnimationFrame(loop);
  fetchServerStats();
}

async function loadStore() {
  return loadStoreData(STORAGE_KEY, rngSeed, currentUser);
}

function persistStore() {
  dataStore.seed = rngSeed;
  persistStoreData(STORAGE_KEY, dataStore, currentUser).catch(() => {});
}

async function clearData() {
  await clearStoreData(STORAGE_KEY, currentUser);
  dataStore = await loadStore();
  applyStoreSettings();
  syncInputMode();
  resetGame(false);
}

function setMode(mode, skipReset = false) {
  state.mode = mode;
  dataStore.settings.mode = mode;
  modeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
  persistStore();
  if (!skipReset) {
    resetGame(false);
  }
  updateServerBest();
}

function setProtocol(protocol, skipReset = false) {
  state.protocol = PROTOCOLS[protocol] ? protocol : 'steady';
  dataStore.settings.protocol = state.protocol;
  protocolInputs.forEach((input) => {
    input.checked = input.value === state.protocol;
  });
  persistStore();
  if (!skipReset) {
    resetGame(false);
  }
}

function buildSpecialTimers() {
  const rate = getProtocolConfig().specialRate || 1;
  return {
    bonus: 1800 * rate,
    toxic: 2400 * rate,
    power: 2800 * rate,
    relic: 3600 * rate,
  };
}

function generateContracts() {
  const pool = [...CONTRACT_POOL];
  const picks = [];
  while (picks.length < 2 && pool.length) {
    const index = randInt(0, pool.length - 1);
    const chosen = pool.splice(index, 1)[0];
    picks.push({
      ...chosen,
      progress: 0,
      done: false,
    });
  }
  return picks;
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
  state.shield = getStartShield();
  state.portalCooldown = 0;
  state.stepCount = 0;
  state.growth = 0;
  state.runShards = 0;
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
  ripples = [];
  specialTimers = buildSpecialTimers();
  state.contracts = generateContracts();
  state.contractsDirty = true;
  state.shopDirty = true;

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

function applyDirection(dirName) {
  const proposed = DIR_VECTORS[dirName];
  if (!proposed) return;
  if (!isOpposite(proposed, direction)) {
    nextDirection = proposed;
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
  updateContracts(stepMs);
  updateLevel();
  updateItems(stepMs);
  updateParticles(stepMs);
  updateRipples(stepMs);
  updateMovers();
  moveSnake();
  emitRainbowTrail();
  emitSkinTrail();
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

function updateContracts(stepMs) {
  if (!state.contracts.length) return;
  addContractProgress('survive', stepMs / 1000);
  setContractProgress('score', state.score);
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
    setContractProgress('level', state.level);
    pulseScreen();
    spawnRipple(canvasSize / 2, canvasSize / 2, '#24f6ff');
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
  const limit = Math.min(5, 1 + Math.floor(state.level / 3));
  const specialRate = getProtocolConfig().specialRate || 1;

  Object.keys(specialTimers).forEach((key) => {
    specialTimers[key] -= stepMs;
    if (specialTimers[key] <= 0 && specials.length < limit) {
      spawnSpecial(key);
      const range = SPECIAL_TIMER_RANGES[key] || [2800, 5200];
      specialTimers[key] = randRange(range[0], range[1]) * specialRate;
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
      addContractProgress('portal', 1);
      spawnRipple(newX * cellSize + cellSize / 2, newY * cellSize + cellSize / 2, '#7b5cff');
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
    state.comboTimer = getComboWindow();
  } else {
    state.combo = 0;
    state.comboTimer = 0;
  }

  const comboTier = Math.min(3, Math.floor(state.combo / 2));
  const powerBoost = state.effects.multiplier > 0 ? 1 : 0;
  const multiplier = 1 + comboTier + powerBoost;
  state.multiplier = multiplier;
  const scoreFactor = baseScore > 0 ? multiplier * getProtocolConfig().score : 1;
  const scoreDelta = baseScore > 0 ? Math.floor(baseScore * scoreFactor) : baseScore;
  state.score = Math.max(0, state.score + scoreDelta);
  setContractProgress('combo', state.combo);
  setContractProgress('score', state.score);

  if (def.grow > 0) {
    state.growth += def.grow;
  }
  if (def.grow < 0) {
    shrinkSnake(Math.abs(def.grow));
  }

  if (item.kind === 'bonus' && state.mode === 'time') {
    state.timeLeft += CONFIG.bonusTime;
  }

  if (item.kind === 'relic') {
    grantShards(randRange(1, 3));
    spawnRipple(item.x * cellSize + cellSize / 2, item.y * cellSize + cellSize / 2, '#ffd166');
    playTone(520, 0.1, 'triangle', 0.08);
  }

  if (item.kind === 'power') {
    activatePower(item.powerType);
  } else if (item.kind !== 'relic') {
    playTone(item.kind === 'toxic' ? 220 : 520, 0.08, 'square', 0.07);
  }

  trackContractItem(item);
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
  updateShardDisplay();
  if (state.contractsDirty) {
    renderContracts();
  }
  if (state.shopDirty) {
    renderUpgrades();
  }
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

function trackContractItem(item) {
  if (item.kind !== 'toxic') {
    addContractProgress('eat', 1);
  }
  if (item.kind === 'bonus') {
    addContractProgress('bonus', 1);
  }
  if (item.kind === 'power') {
    addContractProgress('power', 1);
  }
}

function addContractProgress(type, amount) {
  let updated = false;
  state.contracts.forEach((contract) => {
    if (contract.done || contract.type !== type) return;
    contract.progress = Math.min(contract.target, contract.progress + amount);
    updated = true;
    if (contract.progress >= contract.target) {
      completeContract(contract);
    }
  });
  if (updated) {
    state.contractsDirty = true;
  }
}

function setContractProgress(type, value) {
  let updated = false;
  state.contracts.forEach((contract) => {
    if (contract.done || contract.type !== type) return;
    const next = Math.min(contract.target, value);
    if (next !== contract.progress) {
      contract.progress = next;
      updated = true;
      if (contract.progress >= contract.target) {
        completeContract(contract);
      }
    }
  });
  if (updated) {
    state.contractsDirty = true;
  }
}

function completeContract(contract) {
  contract.done = true;
  state.score += contract.reward.score;
  grantShards(contract.reward.shards);
  spawnRipple(canvasSize / 2, canvasSize / 2, '#4bff88');
  playTone(840, 0.12, 'sawtooth', 0.09);
  state.contractsDirty = true;
}

function renderContracts() {
  contractsList.innerHTML = '';
  if (!state.contracts.length) {
    const empty = document.createElement('div');
    empty.className = 'contract';
    empty.textContent = '暂无合约';
    contractsList.appendChild(empty);
    return;
  }

  state.contracts.forEach((contract) => {
    const row = document.createElement('div');
    row.className = `contract${contract.done ? ' contract--done' : ''}`;
    const progressText =
      contract.type === 'survive'
        ? `${Math.floor(contract.progress)}s/${contract.target}s`
        : `${Math.floor(contract.progress)}/${contract.target}`;
    row.innerHTML = `
      <div>
        <strong>${contract.label}</strong>
        <div class="contract__meta">奖励 +${contract.reward.score} · 霓晶 +${contract.reward.shards}</div>
      </div>
      <div>${progressText}</div>
    `;
    contractsList.appendChild(row);
  });
  state.contractsDirty = false;
}

function grantShards(amount) {
  if (amount <= 0) return;
  dataStore.shards += amount;
  state.runShards += amount;
  persistStore();
  state.shopDirty = true;
}

function updateShardDisplay() {
  const bonusText = state.runShards > 0 ? ` (+${state.runShards})` : '';
  shardDisplay.textContent = `${dataStore.shards}${bonusText}`;
}

function renderUpgrades() {
  upgradesList.innerHTML = '';
  UPGRADES.forEach((upgrade) => {
    const level = getUpgradeLevel(upgrade.id);
    const cost = getUpgradeCost(upgrade);
    const canBuy = dataStore.shards >= cost && level < upgrade.max;
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `
      <div class="upgrade__info">
        <span>${upgrade.label} Lv.${level}/${upgrade.max}</span>
        <em>${upgrade.desc}</em>
      </div>
      <div class="upgrade__cta">
        <button class="btn" data-upgrade="${upgrade.id}" ${canBuy ? '' : 'disabled'}>改造</button>
        <div class="upgrade__cost">霓晶 ${level >= upgrade.max ? 'MAX' : cost}</div>
      </div>
    `;
    upgradesList.appendChild(row);
  });
  state.shopDirty = false;
}

function purchaseUpgrade(upgradeId) {
  const upgrade = UPGRADES.find((item) => item.id === upgradeId);
  if (!upgrade) return;
  const level = getUpgradeLevel(upgrade.id);
  if (level >= upgrade.max) return;
  const cost = getUpgradeCost(upgrade);
  if (dataStore.shards < cost) return;
  dataStore.shards -= cost;
  dataStore.upgrades[upgrade.id] = level + 1;
  persistStore();
  state.shopDirty = true;
  playTone(560, 0.12, 'triangle', 0.08);
}

function getCurrentSpeed() {
  let speed = CONFIG.baseSpeed + (state.level - 1) * 0.6;
  speed += getProtocolConfig().speed;
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

  const protocol = getProtocolConfig();
  const obstacleCount = Math.min(40, Math.max(0, 5 + state.level * 2 + protocol.hazard));
  const moverCount = Math.min(6, Math.max(0, Math.floor(state.level / 3) + protocol.mover));
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
  } else if (kind === 'relic') {
    spawnItem('relic');
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

function emitSkinTrail() {
  if (!snake.length || state.effects.rainbow > 0) return;
  const trail = getSkinTrail();
  if (!trail) return;
  const tail = snake[snake.length - 1];
  const centerX = tail.x * cellSize + cellSize / 2;
  const centerY = tail.y * cellSize + cellSize / 2;
  const count = randRange(trail.count[0], trail.count[1]);

  for (let i = 0; i < count; i += 1) {
    const angle = randFloat(0, Math.PI * 2);
    const speed = randFloat(trail.speed[0], trail.speed[1]) * cellSize;
    const size = randFloat(trail.size[0], trail.size[1]) * cellSize;
    const life = randRange(trail.life[0], trail.life[1]);
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - speed * 0.08,
      size,
      type: trail.type,
      color: trail.color,
      life,
      maxLife: life,
      alpha: trail.alpha,
      rotation: randFloat(0, Math.PI * 2),
      spin: randFloat(-trail.spin, trail.spin),
      gravity: trail.gravity,
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
  const radius = getMagnetRadius();
  items.forEach((item) => {
    if (item.kind === 'toxic') return;
    const distance = Math.abs(item.x - snake[0].x) + Math.abs(item.y - snake[0].y);
    if (distance > radius) return;

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

function noise2(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
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

function getSkinTrail() {
  return getSkinConfig().trail || null;
}

function getProtocolConfig() {
  return PROTOCOLS[state.protocol] || PROTOCOLS.steady;
}

function getUpgradeLevel(id) {
  return dataStore.upgrades?.[id] || 0;
}

function getUpgradeCost(upgrade) {
  const level = getUpgradeLevel(upgrade.id);
  return upgrade.baseCost + level * upgrade.growth;
}

function getComboWindow() {
  const base = CONFIG.comboWindow;
  const upgrade = getUpgradeLevel('combo') * 600;
  const protocol = getProtocolConfig().combo || 0;
  return Math.max(800, base + upgrade + protocol);
}

function getStartShield() {
  const protocol = getProtocolConfig();
  const base = getUpgradeLevel('shield') + protocol.shield;
  return Math.min(3, Math.max(0, base));
}

function getMagnetRadius() {
  const protocol = getProtocolConfig();
  return CONFIG.magnetRadius + getUpgradeLevel('magnet') + (protocol.magnet || 0);
}

function randomChoice(list) {
  return list[Math.floor(rand() * list.length)];
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function resizeCanvas() {
  const shell = canvas.parentElement;
  const rect = shell.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const contentWidth = shell.clientWidth || rect.width;
  const contentHeight = shell.clientHeight || rect.height;
  const rawSize = Math.min(contentWidth, contentHeight);
  const size = Math.max(1, Math.floor(rawSize * dpr) / dpr);
  const pixelSize = Math.max(1, Math.round(size * dpr));
  canvas.width = pixelSize;
  canvas.height = pixelSize;
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
  drawRipples();
  drawPortals();
  drawObstacles();
  drawMovers();
  drawItems();
  drawParticles();
  drawSnake();
}

function drawBackground() {
  ctx.save();
  const protocol = state.protocol;
  const palettes = {
    steady: ['rgba(8, 12, 30, 0.9)', 'rgba(4, 6, 18, 0.9)'],
    surge: ['rgba(24, 8, 24, 0.9)', 'rgba(14, 4, 14, 0.9)'],
    sync: ['rgba(6, 18, 28, 0.9)', 'rgba(4, 10, 18, 0.9)'],
  };
  const palette = palettes[protocol] || palettes.steady;
  const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
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

function updateRipples(stepMs) {
  ripples.forEach((ripple) => {
    ripple.life -= stepMs;
    ripple.radius += ripple.speed * stepMs;
  });
  ripples = ripples.filter((ripple) => ripple.life > 0);
}

function drawRipples() {
  ripples.forEach((ripple) => {
    const lifeRatio = Math.max(0, ripple.life / ripple.maxLife);
    const alpha = ripple.alpha * lifeRatio;
    if (alpha <= 0) return;
    ctx.save();
    ctx.strokeStyle = ripple.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    ctx.shadowColor = ripple.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

function spawnRipple(x, y, color) {
  ripples.push({
    x,
    y,
    radius: cellSize * 0.4,
    speed: 0.02 * cellSize,
    life: 520,
    maxLife: 520,
    alpha: 0.45,
    color,
  });
  if (ripples.length > 20) {
    ripples.splice(0, ripples.length - 20);
  }
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
    if (item.kind === 'relic') {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    } else if (particle.type === 'prism') {
      drawPrism(particle.size);
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

function drawPrism(size) {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.8, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.6, size * 0.1);
  ctx.closePath();
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

function drawSkinTexture(x, y, index, isHead) {
  const skin = getSkinConfig();
  if (skin.texture === 'forest') {
    drawForestTexture(x, y, index, isHead, skin);
  } else if (skin.texture === 'ocean') {
    drawOceanTexture(x, y, index, isHead, skin);
  }
}

function drawForestTexture(x, y, index, isHead, skin) {
  const baseX = x * cellSize;
  const baseY = y * cellSize;
  const seed = x * 17 + y * 31 + index * 7;
  const t = state.stepCount * 0.08;
  const alpha = isHead ? 0.32 : 0.5;
  const bladeCount = 3;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = skin.textureAccent;
  ctx.shadowColor = skin.textureAccent;
  ctx.shadowBlur = 8;
  ctx.lineWidth = Math.max(1, cellSize * 0.05);

  for (let i = 0; i < bladeCount; i += 1) {
    const nx = noise2(x + i, y, seed + i);
    const ny = noise2(x, y + i, seed + 11 + i);
    const px = baseX + cellSize * (0.2 + nx * 0.6);
    const height = cellSize * (0.18 + ny * 0.22);
    const sway = Math.sin(t + nx * 6 + index) * cellSize * 0.06;
    ctx.beginPath();
    ctx.moveTo(px, baseY + cellSize * 0.78);
    ctx.quadraticCurveTo(px + sway, baseY + cellSize * 0.62, px + sway * 0.2, baseY + cellSize * 0.55 - height);
    ctx.stroke();
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = skin.textureAccent;
  ctx.shadowColor = skin.textureDeep;
  ctx.shadowBlur = 6;
  const dotCount = 2;
  for (let i = 0; i < dotCount; i += 1) {
    const nx = noise2(x + i, y + i, seed + 29 + i);
    const ny = noise2(y + i, x + i, seed + 41 + i);
    const radius = cellSize * (0.05 + nx * 0.03);
    ctx.beginPath();
    ctx.arc(baseX + cellSize * (0.2 + nx * 0.6), baseY + cellSize * (0.2 + ny * 0.6), radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOceanTexture(x, y, index, isHead, skin) {
  const baseX = x * cellSize;
  const baseY = y * cellSize;
  const seed = x * 19 + y * 37 + index * 9;
  const t = state.stepCount * 0.1;
  const alpha = isHead ? 0.3 : 0.48;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = skin.textureAccent;
  ctx.shadowColor = skin.textureAccent;
  ctx.shadowBlur = 8;
  ctx.lineWidth = Math.max(1, cellSize * 0.05);

  for (let i = 0; i < 2; i += 1) {
    const wave = Math.sin(t + i + x * 0.6 + y * 0.4) * cellSize * 0.05;
    const yPos = baseY + cellSize * (0.35 + i * 0.25) + wave;
    ctx.beginPath();
    ctx.moveTo(baseX + cellSize * 0.12, yPos);
    ctx.quadraticCurveTo(baseX + cellSize * 0.5, yPos + cellSize * 0.1, baseX + cellSize * 0.88, yPos);
    ctx.stroke();
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillStyle = skin.textureAccent;
  ctx.shadowColor = skin.textureAccent;
  ctx.shadowBlur = 6;
  for (let i = 0; i < 2; i += 1) {
    const nx = noise2(x + i, y + i * 2, seed + 21 + i);
    const ny = noise2(y + i, x + i * 2, seed + 33 + i);
    const radius = cellSize * (0.05 + nx * 0.04);
    ctx.beginPath();
    ctx.arc(baseX + cellSize * (0.2 + nx * 0.6), baseY + cellSize * (0.2 + ny * 0.6), radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSnake() {
  const rainbowActive = state.effects.rainbow > 0;
  const skin = getSkinConfig();
  snake.forEach((seg, index) => {
    if (rainbowActive) {
      const hue = (index * 22 + state.stepCount * 6) % 360;
      const color = rainbowColor(hue);
      drawGlowRect(seg.x, seg.y, color, 0.08, index === 0 ? 1 : 0.8);
    } else {
      const ratio = snake.length > 1 ? index / (snake.length - 1) : 0;
      const color = skinColor(ratio);
      const isHead = index === 0;
      drawGlowRect(seg.x, seg.y, color, 0.1, isHead ? 1 : 0.7);
      if (skin.texture && skin.texture !== 'neon') {
        drawSkinTexture(seg.x, seg.y, index, isHead);
      }
    }
  });

  drawEyes();
  if (state.shield > 0) {
    drawShieldAura();
  }
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

function drawShieldAura() {
  const head = snake[0];
  const centerX = head.x * cellSize + cellSize / 2;
  const centerY = head.y * cellSize + cellSize / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 230, 109, 0.8)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffe66d';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(centerX, centerY, cellSize * 0.55, 0, Math.PI * 2);
  ctx.stroke();
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
    if (!currentUser) {
      serverStats = null;
      serverBestDisplay.textContent = '-';
      return;
    }
    const response = await fetch(`/api/stats?user=${encodeURIComponent(currentUser)}`, { cache: 'no-store' });
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
    if (!currentUser) return;
    const completedContracts = state.contracts.filter((contract) => contract.done).length;
    const response = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser,
        mode: state.mode,
        score: state.score,
        level: state.level,
        duration: state.stepCount,
        seed: rngSeed,
        protocol: state.protocol,
        skin: dataStore.settings.skin,
        shardsEarned: state.runShards,
        contractsCompleted: completedContracts,
        contractsTotal: state.contracts.length,
        lives: state.lives,
        timeLeft: state.timeLeft,
        multiplier: state.multiplier,
        combo: state.combo,
        upgrades: dataStore.upgrades,
        effects: state.effects,
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
  audio.init();
  audio.setEnabled(soundToggle.checked);
}

function playTone(freq, duration, type, gainValue) {
  audio.playTone(freq, duration, type, gainValue);
}

init();
