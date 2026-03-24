// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const logger = require('./logger');
const { loadConfig } = require('./config');

let userMap = null;

const raw = loadConfig('users');
if (raw) {
  userMap = { ...raw };
  for (const k in raw) {
    userMap[k.toLowerCase()] = raw[k];
  }
  logger.info(`Loaded ${Object.keys(raw).length} users`);
}

const getTelegramUserId = (user) => {
  if (!user || !userMap) return null;
  const lowerName = user.display_name?.toLowerCase();
  return userMap[user.id] ?? userMap[lowerName] ?? null;
};

module.exports = { getTelegramUserId };
