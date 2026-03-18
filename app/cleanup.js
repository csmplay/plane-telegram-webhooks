// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const db = require('./database');
const telegramService = require('./telegram');
const logger = require('./logger');

const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const cleanupTimers = new Map();

const scheduleCleanup = ({ taskNumber, chatId }) => {
  const existing = cleanupTimers.get(taskNumber);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(async () => {
    try {
      const messageId = db.getMessageId(taskNumber);

      if (!messageId || (await telegramService.deleteNotification({ messageId, chatId }))) {
        db.deleteMessageId(taskNumber);
        logger.info(`Cleaned up completed task`, { taskNumber });
      }
    } catch (error) {
      logger.error(`Cleanup failed for task`, { taskNumber, error: error.message });
    } finally {
      cleanupTimers.delete(taskNumber);
    }
  }, CLEANUP_DELAY_MS);

  cleanupTimers.set(taskNumber, { timeoutId });
  logger.info(`Scheduled cleanup for task`, { taskNumber, delayMinutes: CLEANUP_DELAY_MS / 60000 });
};

const cancelCleanup = (taskNumber) => {
  const existing = cleanupTimers.get(taskNumber);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
    cleanupTimers.delete(taskNumber);
    logger.info(`Cancelled cleanup for task`, { taskNumber });
  }
};

const cancelAll = () => {
  for (const [, entry] of cleanupTimers) {
    if (entry?.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
  }
  cleanupTimers.clear();
};

const runCleanup = async (taskNumber, chatId) => {
  try {
    const messageId = db.getMessageId(taskNumber);
    if (!messageId || (await telegramService.deleteNotification({ messageId, chatId }))) {
      db.deleteMessageId(taskNumber);
      logger.info(`Cleaned up completed task`, { taskNumber });
    }
  } catch (error) {
    logger.error(`Cleanup failed for task`, { taskNumber, error: error.message });
  }
  cleanupTimers.delete(taskNumber);
};

const flushAll = async (chatId) => {
  for (const [taskNumber] of cleanupTimers) {
    await runCleanup(taskNumber, chatId);
  }
};

module.exports = {
  scheduleCleanup,
  cancelCleanup,
  cancelAll,
  cleanupTimers,
  runCleanup,
  flushAll
};