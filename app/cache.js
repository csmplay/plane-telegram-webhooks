// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const store = new Map();

const MISSING = Symbol('missing');

const set = (key, value, ttlMs = 60 * 60 * 1000) => {
  store.set(key, { value, expires: Date.now() + ttlMs });
};

const get = (key) => {
  const entry = store.get(key);
  if (!entry) return MISSING;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return MISSING;
  }
  return entry.value;
};

module.exports = { set, get, MISSING };
