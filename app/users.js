// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let userMap = null;

const jsonPath = path.join(__dirname, '../config/users.json');
if (fs.existsSync(jsonPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    userMap = { ...raw };
    for (const k in raw) {
      userMap[k.toLowerCase()] = raw[k];
    }
    logger.info(`Loaded ${Object.keys(raw).length} users from config/users.json`);
  } catch (err) {
    logger.warn(`Failed to load config/users.json: ${err.message}`);
  }
}

const getTelegramUserId = (user) => {
  if (!user || !userMap) return null;
  const lowerName = user.display_name?.toLowerCase();
  return userMap[user.id] ?? userMap[lowerName] ?? null;
};

module.exports = { getTelegramUserId };
