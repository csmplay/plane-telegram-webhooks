// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const telegramService = require('./telegram');
const db = require('./database');
const logger = require('./logger');

const INITIAL_POST_DELAY_MS = 2 * 60 * 1000; // 2m
const pendingInitialPosts = new Map();
let generation = 0;

const executePendingPost = async (taskNumber, gen) => {
  const pending = pendingInitialPosts.get(taskNumber);
  if (!pending || pending.gen !== gen) return;

  try {
    const messageId = db.getMessageId(taskNumber);
    if (messageId) {
      await telegramService.editNotification({
        message: pending.message,
        taskNumber,
        chatId: pending.chatId
      });
      logger.info(`Applied delayed update to existing message`, { taskNumber });
    } else {
      await telegramService.sendNotification({
        message: pending.message,
        taskNumber,
        chatId: pending.chatId,
        threadId: pending.threadId
      });
    }
  } catch (error) {
    logger.error(`Delayed post failed`, { taskNumber, error: error.message });
  } finally {
    const current = pendingInitialPosts.get(taskNumber);
    if (current && current.gen === gen) {
      pendingInitialPosts.delete(taskNumber);
    }
  }
};

const scheduleInitialPost = ({ taskNumber, message, chatId, threadId }) => {
  const existing = pendingInitialPosts.get(taskNumber);

  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  const gen = ++generation;
  const timeoutId = setTimeout(() => executePendingPost(taskNumber, gen), INITIAL_POST_DELAY_MS);
  pendingInitialPosts.set(taskNumber, { timeoutId, message, chatId, threadId, gen });
};

const clearPendingPost = (taskNumber) => {
  const pending = pendingInitialPosts.get(taskNumber);
  if (pending?.timeoutId) {
    clearTimeout(pending.timeoutId);
    pendingInitialPosts.delete(taskNumber);
  }
};

const flushAll = async () => {
  const tasks = Array.from(pendingInitialPosts.entries());

  for (const [taskNumber, pending] of tasks) {
    if (pending?.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    await executePendingPost(taskNumber, pending.gen);
  }
};

module.exports = {
  scheduleInitialPost,
  clearPendingPost,
  flushAll,
  pendingInitialPosts
};
