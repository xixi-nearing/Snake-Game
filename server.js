const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'neon-snake');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'neon-snake.sqlite');
const STORAGE_KEY_DEFAULT = 'neonSnakeDataV1';
const VALID_MODES = new Set(['classic', 'survival', 'time']);
const USERNAME_RE = /^[A-Za-z0-9_-]+$/;
const USERNAME_MAX = 32;
const MAX_GAMES_PER_USER = 200;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_store (
    username TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (username, key),
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    mode TEXT NOT NULL,
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    seed INTEGER,
    protocol TEXT,
    skin TEXT,
    shards INTEGER,
    contracts_completed INTEGER,
    contracts_total INTEGER,
    lives INTEGER,
    time_left REAL,
    multiplier REAL,
    combo INTEGER,
    ended_at INTEGER NOT NULL,
    meta TEXT,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_games_user_time ON games(username, ended_at DESC);
`);

const getUserStmt = db.prepare('SELECT username FROM users WHERE username = ?');
const insertUserStmt = db.prepare('INSERT INTO users (username, created_at, last_seen) VALUES (?, ?, ?)');
const updateUserSeenStmt = db.prepare('UPDATE users SET last_seen = ? WHERE username = ?');

const getStoreStmt = db.prepare('SELECT value FROM user_store WHERE username = ? AND key = ?');
const setStoreStmt = db.prepare(
  `INSERT INTO user_store (username, key, value, updated_at)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(username, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
);
const deleteStoreStmt = db.prepare('DELETE FROM user_store WHERE username = ? AND key = ?');
const deleteGamesForUserStmt = db.prepare('DELETE FROM games WHERE username = ?');
const insertGameStmt = db.prepare(
  `INSERT INTO games (
    username, mode, score, level, duration, seed, protocol, skin, shards,
    contracts_completed, contracts_total, lives, time_left, multiplier, combo, ended_at, meta
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const trimGamesStmt = db.prepare(
  `DELETE FROM games
   WHERE username = ?
     AND id NOT IN (
       SELECT id FROM games WHERE username = ? ORDER BY ended_at DESC LIMIT ?
     )`
);

function buildFallback() {
  return {
    settings: { sound: true, grid: true, mode: 'classic', skin: 'neon', protocol: 'steady', inputMode: '' },
    best: { classic: 0, survival: 0, time: 0 },
    maxLevel: 1,
    seed: 0,
    shards: 0,
    upgrades: { magnet: 0, shield: 0, combo: 0 },
  };
}

function normalizeStore(data) {
  const fallback = buildFallback();
  return {
    settings: { ...fallback.settings, ...(data?.settings || {}) },
    best: { ...fallback.best, ...(data?.best || {}) },
    maxLevel: data?.maxLevel || 1,
    seed: data?.seed || 0,
    shards: typeof data?.shards === 'number' ? data.shards : fallback.shards,
    upgrades: { ...fallback.upgrades, ...(data?.upgrades || {}) },
  };
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > USERNAME_MAX) return null;
  if (!USERNAME_RE.test(trimmed)) return null;
  return trimmed;
}

function ensureUser(username) {
  const existing = getUserStmt.get(username);
  const now = Date.now();
  if (!existing) {
    insertUserStmt.run(username, now, now);
    return 'new';
  }
  updateUserSeenStmt.run(now, username);
  return 'existing';
}

function readStore(username, key) {
  const row = getStoreStmt.get(username, key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return null;
  }
}

function writeStore(username, key, data) {
  setStoreStmt.run(username, key, JSON.stringify(data), Date.now());
}

function removeStore(username, key) {
  deleteStoreStmt.run(username, key);
  deleteGamesForUserStmt.run(username);
}

function recordGame(username, payload) {
  insertGameStmt.run(
    username,
    payload.mode,
    payload.score,
    payload.level,
    payload.duration,
    payload.seed,
    payload.protocol,
    payload.skin,
    payload.shards,
    payload.contractsCompleted,
    payload.contractsTotal,
    payload.lives,
    payload.timeLeft,
    payload.multiplier,
    payload.combo,
    payload.endedAt,
    payload.meta
  );
  trimGamesStmt.run(username, username, MAX_GAMES_PER_USER);
}

function getStats(store) {
  const best = store?.best || {};
  return {
    best: {
      classic: typeof best.classic === 'number' ? best.classic : 0,
      survival: typeof best.survival === 'number' ? best.survival : 0,
      time: typeof best.time === 'number' ? best.time : 0,
    },
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

function serveStatic(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  const decodedPath = decodeURIComponent(urlPath);
  const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    sendText(res, 404, 'Not Found');
    return;
  }

  const finalPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
  try {
    const data = fs.readFileSync(finalPath);
    res.writeHead(200, {
      'Content-Type': getMimeType(finalPath),
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'GET') {
      res.end(data);
    } else {
      res.end();
    }
  } catch (error) {
    sendText(res, 404, 'Not Found');
  }
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const username = normalizeUsername(body?.username);
    if (!username) {
      sendJson(res, 400, { error: 'Invalid username' });
      return;
    }
    const status = ensureUser(username);
    sendJson(res, 200, { status, username });
    return;
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const username = normalizeUsername(url.searchParams.get('user') || '');
    const key = url.searchParams.get('key') || STORAGE_KEY_DEFAULT;
    if (!username) {
      sendJson(res, 400, { error: 'Invalid username' });
      return;
    }
    ensureUser(username);
    const store = readStore(username, key);
    sendJson(res, 200, getStats(store));
    return;
  }

  if (url.pathname === '/api/score' && req.method === 'POST') {
    const body = await readBody(req);
    const username = normalizeUsername(body?.username);
    const mode = body?.mode;
    const score = Number(body?.score);
    const level = Number(body?.level);
    const duration = Number(body?.duration);
    const key = body?.key || STORAGE_KEY_DEFAULT;

    if (!username || !VALID_MODES.has(mode) || !Number.isFinite(score)) {
      sendJson(res, 400, { error: 'Invalid payload' });
      return;
    }

    ensureUser(username);
    const store = normalizeStore(readStore(username, key));
    let updated = false;

    if (score > (store.best[mode] || 0)) {
      store.best[mode] = score;
      updated = true;
    }
    if (Number.isFinite(level) && level > store.maxLevel) {
      store.maxLevel = level;
      updated = true;
    }
    if (Number.isFinite(duration) && duration > 0) {
      store.lastRun = { mode, score, level, duration, endedAt: Date.now() };
      updated = true;
    }

    const meta = {
      upgrades: body?.upgrades || null,
      effects: body?.effects || null,
    };

    recordGame(username, {
      mode,
      score,
      level: Number.isFinite(level) ? level : 0,
      duration: Number.isFinite(duration) ? duration : 0,
      seed: Number.isFinite(Number(body?.seed)) ? Number(body?.seed) : null,
      protocol: typeof body?.protocol === 'string' ? body.protocol : null,
      skin: typeof body?.skin === 'string' ? body.skin : null,
      shards: Number.isFinite(Number(body?.shardsEarned)) ? Number(body?.shardsEarned) : 0,
      contractsCompleted: Number.isFinite(Number(body?.contractsCompleted)) ? Number(body?.contractsCompleted) : 0,
      contractsTotal: Number.isFinite(Number(body?.contractsTotal)) ? Number(body?.contractsTotal) : 0,
      lives: Number.isFinite(Number(body?.lives)) ? Number(body?.lives) : null,
      timeLeft: Number.isFinite(Number(body?.timeLeft)) ? Number(body?.timeLeft) : null,
      multiplier: Number.isFinite(Number(body?.multiplier)) ? Number(body?.multiplier) : null,
      combo: Number.isFinite(Number(body?.combo)) ? Number(body?.combo) : null,
      endedAt: Date.now(),
      meta: JSON.stringify(meta),
    });

    if (updated) {
      writeStore(username, key, store);
    }
    sendJson(res, 200, getStats(store));
    return;
  }

  if (url.pathname === '/api/store' && req.method === 'GET') {
    const key = url.searchParams.get('key') || STORAGE_KEY_DEFAULT;
    const username = normalizeUsername(url.searchParams.get('user') || '');
    if (!username) {
      sendJson(res, 400, { error: 'Invalid username' });
      return;
    }
    ensureUser(username);
    const data = readStore(username, key);
    sendJson(res, 200, { key, user: username, data });
    return;
  }

  if (url.pathname === '/api/store' && req.method === 'PUT') {
    const body = await readBody(req);
    const key = body?.key || STORAGE_KEY_DEFAULT;
    const username = normalizeUsername(body?.user || '');
    const data = body?.data;
    if (!username || !key || !data) {
      sendJson(res, 400, { error: 'Invalid payload' });
      return;
    }
    ensureUser(username);
    writeStore(username, key, normalizeStore(data));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/store' && req.method === 'DELETE') {
    const body = await readBody(req);
    const key = body?.key || STORAGE_KEY_DEFAULT;
    const username = normalizeUsername(body?.user || '');
    if (!username) {
      sendJson(res, 400, { error: 'Invalid username' });
      return;
    }
    removeStore(username, key);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendText(res, 404, 'Not Found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Neon Snake server running at http://localhost:${PORT}`);
});
