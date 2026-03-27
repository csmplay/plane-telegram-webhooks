// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

require('dotenv').config();

const express = require('express');
const logger = require('./logger');
const db = require('./database');

const ENV_VARS = {
  PLANE_WEBHOOK_SECRET: process.env.PLANE_WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  TELEGRAM_THREAD_ID: process.env.TELEGRAM_THREAD_ID,
  START_MESSAGE_ID: process.env.START_MESSAGE_ID,
  PLANE_BASE_URL: process.env.PLANE_BASE_URL,
  PLANE_WORKSPACE_SLUG: process.env.PLANE_WORKSPACE_SLUG,
  PLANE_API_KEY: process.env.PLANE_API_KEY,
  DEADLINE_CHECK_TIME: process.env.DEADLINE_CHECK_TIME,
  DEADLINE_NOTIFY_DAYS: process.env.DEADLINE_NOTIFY_DAYS,
  TZ: process.env.TZ
};

{
  const errors = [];
  ['PLANE_WEBHOOK_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].forEach(key => {
    if (!ENV_VARS[key]) errors.push(`Missing required env variable: ${key}`);
  });
  if (ENV_VARS.TELEGRAM_CHAT_ID && isNaN(parseInt(ENV_VARS.TELEGRAM_CHAT_ID))) {
    errors.push('TELEGRAM_CHAT_ID must be a number');
  }
  if (ENV_VARS.TELEGRAM_THREAD_ID && isNaN(parseInt(ENV_VARS.TELEGRAM_THREAD_ID))) {
    errors.push('TELEGRAM_THREAD_ID must be a number');
  }
  if (ENV_VARS.START_MESSAGE_ID && isNaN(parseInt(ENV_VARS.START_MESSAGE_ID))) {
    errors.push('START_MESSAGE_ID must be a number');
  }
  if (ENV_VARS.PLANE_BASE_URL) {
    try { new URL(ENV_VARS.PLANE_BASE_URL); } catch { errors.push('PLANE_BASE_URL must be a valid URL'); }
  }
  if (errors.length > 0) {
    logger.error('Configuration validation failed:\n' + errors.map(e => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  const planeVars = [ENV_VARS.PLANE_BASE_URL, ENV_VARS.PLANE_WORKSPACE_SLUG, ENV_VARS.PLANE_API_KEY];
  if (planeVars.some(Boolean) && !planeVars.every(Boolean)) {
    logger.warn('Partial Plane config — set all of PLANE_BASE_URL, PLANE_WORKSPACE_SLUG, PLANE_API_KEY for issue links and API enrichment');
  }
}

const telegramService = require('./telegram');
const webhookHandlers = require('./webhook');
const debounce = require('./debounce');
const cleanup = require('./cleanup');
const deadlines = require('./deadlines');
const template = require('./template');
const { getHealthData } = require('./health');

telegramService.init(ENV_VARS);
if (ENV_VARS.START_MESSAGE_ID !== '0') {
  telegramService.setStartMessage({
    env: ENV_VARS,
    db,
    template,
    debounce,
    cleanup
  });
}
telegramService.setupCommands(template);

const app = express();
app.use(express.raw({ type: '*/*', limit: '1mb' }));

const webhookConfig = {
  baseUrl: ENV_VARS.PLANE_BASE_URL,
  workspaceSlug: ENV_VARS.PLANE_WORKSPACE_SLUG,
  apiKey: ENV_VARS.PLANE_API_KEY,
  chatId: ENV_VARS.TELEGRAM_CHAT_ID,
  threadId: ENV_VARS.TELEGRAM_THREAD_ID
};

app.post('/webhook',
  webhookHandlers.verifySignature(ENV_VARS.PLANE_WEBHOOK_SECRET),
  webhookHandlers.parsePayload,
  webhookHandlers.checkDuplicate,
  webhookHandlers.handleNotification(webhookConfig)
);

app.get('/health', (req, res) => {
  res.json(getHealthData({ db, debounce, cleanup, template }));
});

const PORT = process.env.PORT || 3111;
const server = app.listen(PORT, () => {
  logger.info(`Webhook service started`, { port: PORT });

  if (ENV_VARS.PLANE_BASE_URL && ENV_VARS.PLANE_API_KEY) {
    const notifyDays = ENV_VARS.DEADLINE_NOTIFY_DAYS
      ? ENV_VARS.DEADLINE_NOTIFY_DAYS.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n))
      : undefined;

    deadlines.start({
      baseUrl: ENV_VARS.PLANE_BASE_URL,
      workspaceSlug: ENV_VARS.PLANE_WORKSPACE_SLUG,
      apiKey: ENV_VARS.PLANE_API_KEY,
      checkTime: ENV_VARS.DEADLINE_CHECK_TIME,
      notifyDays,
      tz: ENV_VARS.TZ
    });
  }
});

let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down`);

  server.close();

  if (debounce.pendingInitialPosts.size > 0) {
    logger.info(`Flushing ${debounce.pendingInitialPosts.size} pending posts...`);
    await debounce.flushAll();
  }

  if (cleanup.cleanupTimers.size > 0) {
    logger.info(`Running ${cleanup.cleanupTimers.size} delayed cleanups...`);
    await cleanup.flushAll(ENV_VARS.TELEGRAM_CHAT_ID);
    cleanup.cancelAll();
  }

  deadlines.stop();

  db.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
