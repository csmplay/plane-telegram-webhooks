// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const fs = require('fs');
const path = require('path');

let version = '0.0.0';

try {
  version = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version;
} catch {}

module.exports = { version };
