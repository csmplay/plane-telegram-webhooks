// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const loadConfig = (name) => {
  const jsonPath = path.join(__dirname, `../config/${name}.json`);
  const jsPath = path.join(__dirname, `../config/${name}.js`);

  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err) {
      logger.warn(`Failed to load config/${name}.json: ${err.message}`);
      return null;
    }
  }

  if (fs.existsSync(jsPath)) {
    try {
      const config = require(jsPath);
      logger.warn(`Using deprecated config/${name}.js. Trying to migrate it to config/${name}.json`);
      try {
        fs.writeFileSync(jsonPath, JSON.stringify(config, null, 2), 'utf8');
        logger.info(`Migrated config/${name}.js to config/${name}.json`);
      } catch (writeErr) {
        logger.warn(`Failed to migrate config to JSON: ${writeErr.message}`);
      }
      return config;
    } catch (err) {
      logger.warn(`Failed to load config/${name}.js: ${err.message}`);
      return null;
    }
  }

  return null;
};

module.exports = { loadConfig };
