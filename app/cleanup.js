// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const db = require('./database');
const telegramService = require('./telegram');
const logger = require('./logger');

const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const cleanupTimers = new Map();

const scheduleCleanup = ({ taskId, taskNumber, chatId }) => {
  const existing = cleanupTimers.get(taskId);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(async () => {
    try {
      const messageId = db.getMessageId(taskId);

      if (!messageId || (await telegramService.deleteNotification({ messageId, chatId }))) {
        db.deleteMessageId(taskId);
        logger.info(`Cleaned up completed task`, { taskNumber });
      }
    } catch (error) {
      logger.error(`Cleanup failed for task`, { taskNumber, error: error.message });
    } finally {
      cleanupTimers.delete(taskId);
    }
  }, CLEANUP_DELAY_MS);

  cleanupTimers.set(taskId, { timeoutId, taskNumber });
  logger.info(`Scheduled cleanup for task`, { taskNumber, delayMinutes: CLEANUP_DELAY_MS / 60000 });
};

const cancelCleanup = (taskId) => {
  const existing = cleanupTimers.get(taskId);
  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
    cleanupTimers.delete(taskId);
    logger.info(`Cancelled cleanup for task`, { taskNumber: existing.taskNumber });
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

const runCleanup = async (taskId, taskNumber, chatId) => {
  try {
    const messageId = db.getMessageId(taskId);
    if (!messageId || (await telegramService.deleteNotification({ messageId, chatId }))) {
      db.deleteMessageId(taskId);
      logger.info(`Cleaned up completed task`, { taskNumber });
    }
  } catch (error) {
    logger.error(`Cleanup failed for task`, { taskNumber, error: error.message });
  }
  cleanupTimers.delete(taskId);
};

const flushAll = async (chatId) => {
  for (const [taskId, entry] of cleanupTimers) {
    await runCleanup(taskId, entry?.taskNumber ?? 'unknown', chatId);
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