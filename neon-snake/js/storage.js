const STORE_ENDPOINT = '/api/store';
const LOCAL_USER_KEY = 'neonSnakeUser';

function buildLocalKey(storageKey, username) {
  const userKey = username || 'guest';
  return `${storageKey}::${userKey}`;
}

function buildFallback(rngSeed) {
  return {
    settings: { sound: true, grid: true, mode: 'classic', skin: 'neon', protocol: 'steady', inputMode: '' },
    best: { classic: 0, survival: 0, time: 0 },
    maxLevel: 1,
    seed: rngSeed,
    shards: 0,
    upgrades: { magnet: 0, shield: 0, combo: 0 },
  };
}

function normalizeStore(data, rngSeed) {
  const fallback = buildFallback(rngSeed);
  return {
    settings: { ...fallback.settings, ...(data.settings || {}) },
    best: { ...fallback.best, ...(data.best || {}) },
    maxLevel: data.maxLevel || 1,
    seed: data.seed || rngSeed,
    shards: typeof data.shards === 'number' ? data.shards : fallback.shards,
    upgrades: { ...fallback.upgrades, ...(data.upgrades || {}) },
  };
}

function readLocalStore(storageKey, rngSeed, username) {
  const fallback = buildFallback(rngSeed);
  try {
    const raw = localStorage.getItem(buildLocalKey(storageKey, username));
    if (!raw) return { store: fallback, found: false };
    const data = JSON.parse(raw);
    return { store: normalizeStore(data, rngSeed), found: true };
  } catch (error) {
    return { store: fallback, found: false };
  }
}

async function fetchStore(storageKey, rngSeed, username) {
  const response = await fetch(
    `${STORE_ENDPOINT}?key=${encodeURIComponent(storageKey)}&user=${encodeURIComponent(username)}`,
    { cache: 'no-store' }
  );
  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload || !payload.data) return null;
  return normalizeStore(payload.data, rngSeed);
}

async function saveStore(storageKey, dataStore, username) {
  await fetch(STORE_ENDPOINT, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: storageKey, user: username, data: dataStore }),
  });
}

async function deleteStore(storageKey, username) {
  await fetch(STORE_ENDPOINT, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: storageKey, user: username }),
  });
}

export async function loadStore(storageKey, rngSeed, username) {
  const { store: localStore, found } = readLocalStore(storageKey, rngSeed, username);
  if (!username) return localStore;
  try {
    const remoteStore = await fetchStore(storageKey, rngSeed, username);
    if (remoteStore) {
      localStorage.setItem(buildLocalKey(storageKey, username), JSON.stringify(remoteStore));
      return remoteStore;
    }
    if (found) {
      await saveStore(storageKey, localStore, username);
    }
  } catch (error) {
    // Server unavailable; fallback to localStorage.
  }
  return localStore;
}

export async function persistStore(storageKey, dataStore, username) {
  localStorage.setItem(buildLocalKey(storageKey, username), JSON.stringify(dataStore));
  if (!username) return;
  try {
    await saveStore(storageKey, dataStore, username);
  } catch (error) {
    // Ignore server errors; localStorage already updated.
  }
}

export async function clearStore(storageKey, username) {
  localStorage.removeItem(buildLocalKey(storageKey, username));
  if (!username) return;
  try {
    await deleteStore(storageKey, username);
  } catch (error) {
    // Ignore server errors.
  }
}

export function loadLastUsername() {
  try {
    return localStorage.getItem(LOCAL_USER_KEY) || '';
  } catch (error) {
    return '';
  }
}

export function persistLastUsername(username) {
  try {
    if (username) {
      localStorage.setItem(LOCAL_USER_KEY, username);
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  } catch (error) {
    // ignore
  }
}
