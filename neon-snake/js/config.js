export const CONFIG = {
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

export const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const KEY_TO_DIR = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

export const STORAGE_KEY = 'neonSnakeDataV1';

export const ITEM_DEFS = {
  food: { score: 10, grow: 1, ttl: Infinity, color: '#24f6ff' },
  bonus: { score: 25, grow: 2, ttl: 6000, color: '#ff3df0' },
  toxic: { score: -15, grow: -2, ttl: 7000, color: '#ff5978' },
  power: { score: 12, grow: 0, ttl: 7000, color: '#4bff88' },
  relic: { score: 16, grow: 0, ttl: 8000, color: '#ffd166' },
};

export const SKINS = {
  neon: { base: 190, spread: 140, sat: 92, light: 60, shimmer: 0.35 },
  ocean: { base: 200, spread: 70, sat: 85, light: 55, shimmer: 0.18 },
  forest: { base: 115, spread: 80, sat: 70, light: 50, shimmer: 0.12 },
};

export const PROTOCOLS = {
  steady: {
    label: '稳态协议',
    speed: -0.6,
    hazard: -3,
    mover: -1,
    score: 0.9,
    combo: 600,
    magnet: 0,
    shield: 1,
    specialRate: 1.1,
  },
  surge: {
    label: '过载协议',
    speed: 1.2,
    hazard: 4,
    mover: 1,
    score: 1.2,
    combo: -300,
    magnet: 0,
    shield: 0,
    specialRate: 0.85,
  },
  sync: {
    label: '连携协议',
    speed: 0.3,
    hazard: 0,
    mover: 0,
    score: 1.05,
    combo: 1200,
    magnet: 1,
    shield: 0,
    specialRate: 1,
  },
};

export const PARTICLE_STYLES = {
  food: { type: 'spark', count: [8, 12], size: [0.1, 0.16], life: [260, 420], speed: [0.02, 0.045], alpha: 0.6 },
  bonus: { type: 'star', count: [12, 16], size: [0.16, 0.22], life: [380, 560], speed: [0.03, 0.06], alpha: 0.75 },
  power: { type: 'petal', count: [10, 14], size: [0.18, 0.26], life: [480, 720], speed: [0.02, 0.045], alpha: 0.55 },
  toxic: { type: 'leaf', count: [8, 12], size: [0.18, 0.28], life: [520, 820], speed: [0.015, 0.035], alpha: 0.5 },
  rainbow: { type: 'orb', count: [14, 18], size: [0.14, 0.22], life: [420, 720], speed: [0.02, 0.05], alpha: 0.7 },
  relic: { type: 'prism', count: [10, 14], size: [0.18, 0.26], life: [420, 680], speed: [0.02, 0.045], alpha: 0.65 },
};

export const POWER_TYPES = [
  { id: 'speed', label: '超频', duration: 6500, color: '#00f5ff' },
  { id: 'slow', label: '缓流', duration: 6500, color: '#7b5cff' },
  { id: 'shield', label: '护盾', duration: 9000, color: '#ffe66d' },
  { id: 'ghost', label: '幽影', duration: 6500, color: '#f99dff' },
  { id: 'magnet', label: '磁力场', duration: 6500, color: '#4bff88' },
  { id: 'multiplier', label: '倍增', duration: 7500, color: '#ff3df0' },
  { id: 'rainbow', label: '虹蛇', duration: 15000, color: '#ffd166' },
];

export const CONTRACT_POOL = [
  { id: 'eat', label: '能量连锁', type: 'eat', target: 6, reward: { score: 140, shards: 2 } },
  { id: 'power', label: '异能采集', type: 'power', target: 2, reward: { score: 180, shards: 3 } },
  { id: 'bonus', label: '爆燃收藏', type: 'bonus', target: 2, reward: { score: 160, shards: 2 } },
  { id: 'portal', label: '跃迁试炼', type: 'portal', target: 3, reward: { score: 150, shards: 2 } },
  { id: 'combo', label: '连击风暴', type: 'combo', target: 4, reward: { score: 200, shards: 3 } },
  { id: 'survive', label: '轨迹稳定', type: 'survive', target: 30, reward: { score: 150, shards: 2 } },
  { id: 'level', label: '层级突破', type: 'level', target: 4, reward: { score: 190, shards: 3 } },
  { id: 'score', label: '霓光冲刺', type: 'score', target: 520, reward: { score: 220, shards: 4 } },
];

export const UPGRADES = [
  { id: 'magnet', label: '磁场扩展', desc: '吸附范围 +1', max: 3, baseCost: 6, growth: 4 },
  { id: 'shield', label: '护盾储备', desc: '开局护盾 +1', max: 2, baseCost: 9, growth: 6 },
  { id: 'combo', label: '连击缓存', desc: '连击窗口 +0.6s', max: 4, baseCost: 7, growth: 4 },
];

export const SPECIAL_TIMER_RANGES = {
  bonus: [2600, 5200],
  toxic: [3200, 5600],
  power: [3000, 5200],
  relic: [4200, 7600],
};
