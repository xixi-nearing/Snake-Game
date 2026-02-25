export function loadStore(storageKey, rngSeed) {
  const fallback = {
    settings: { sound: true, grid: true, mode: 'classic', skin: 'neon', protocol: 'steady', inputMode: '' },
    best: { classic: 0, survival: 0, time: 0 },
    maxLevel: 1,
    seed: rngSeed,
    shards: 0,
    upgrades: { magnet: 0, shield: 0, combo: 0 },
  };

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return {
      settings: { ...fallback.settings, ...(data.settings || {}) },
      best: { ...fallback.best, ...(data.best || {}) },
      maxLevel: data.maxLevel || 1,
      seed: data.seed || rngSeed,
      shards: typeof data.shards === 'number' ? data.shards : fallback.shards,
      upgrades: { ...fallback.upgrades, ...(data.upgrades || {}) },
    };
  } catch (error) {
    return fallback;
  }
}

export function persistStore(storageKey, dataStore) {
  localStorage.setItem(storageKey, JSON.stringify(dataStore));
}

export function clearStore(storageKey) {
  localStorage.removeItem(storageKey);
}
