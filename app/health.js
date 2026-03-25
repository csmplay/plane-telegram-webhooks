// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const { userCount } = require('./users');
const { version } = require('./version');

const getStatus = (db) => {
  try {
    db.getMessageCount();
    return 'ok';
  } catch {
    return 'error';
  }
};

const getHealthData = ({ db, debounce, cleanup, template, pretty }) => {
  const data = {
    status: getStatus(db),
    uptime: Math.floor(process.uptime()),
    pendingPosts: debounce.pendingInitialPosts.size,
    pendingDeletes: cleanup.cleanupTimers.size,
    totalMessages: db.getMessageCount(),
    templateLoaded: template.customConfigStatus,
    users: userCount,
    version,
    lastUpdate: new Date().toISOString()
  };

  if (pretty) {
    const { locale, options } = template.labels.timeFormat;
    return {
      ...data,
      uptime: Math.floor(data.uptime / 60) + ' minutes',
      lastUpdate: new Date().toLocaleString(locale, options)
    };
  }

  return data;
};

module.exports = { getHealthData };
