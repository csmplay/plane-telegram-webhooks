// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const telegramService = require('./telegram');
const db = require('./database');
const logger = require('./logger');

const INITIAL_POST_DELAY_MS = 2 * 60 * 1000; // 2m
const pendingInitialPosts = new Map();
let generation = 0;

const executePendingPost = async (taskId, gen) => {
  const pending = pendingInitialPosts.get(taskId);
  if (!pending || pending.gen !== gen) return;

  try {
    const messageId = db.getMessageId(taskId);
    if (messageId) {
      await telegramService.editNotification({
        message: pending.message,
        taskId,
        taskNumber: pending.taskNumber,
        chatId: pending.chatId
      });
      logger.info(`Applied delayed update to existing message`, { taskNumber: pending.taskNumber });
    } else {
      await telegramService.sendNotification({
        message: pending.message,
        taskId,
        taskNumber: pending.taskNumber,
        chatId: pending.chatId,
        threadId: pending.threadId
      });
    }
  } catch (error) {
    logger.error(`Delayed post failed`, { taskNumber: pending.taskNumber, error: error.message });
  } finally {
    const current = pendingInitialPosts.get(taskId);
    if (current && current.gen === gen) {
      pendingInitialPosts.delete(taskId);
    }
  }
};

const scheduleInitialPost = ({ taskId, taskNumber, message, chatId, threadId }) => {
  const existing = pendingInitialPosts.get(taskId);

  if (existing?.timeoutId) {
    clearTimeout(existing.timeoutId);
  }

  const gen = ++generation;
  const timeoutId = setTimeout(() => executePendingPost(taskId, gen), INITIAL_POST_DELAY_MS);
  pendingInitialPosts.set(taskId, { timeoutId, message, chatId, threadId, gen, taskNumber });
};

const clearPendingPost = (taskId) => {
  const pending = pendingInitialPosts.get(taskId);
  if (pending?.timeoutId) {
    clearTimeout(pending.timeoutId);
    pendingInitialPosts.delete(taskId);
  }
};

const flushAll = async () => {
  const tasks = Array.from(pendingInitialPosts.entries());

  for (const [taskId, pending] of tasks) {
    if (pending?.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    await executePendingPost(taskId, pending.gen);
  }
};

module.exports = {
  scheduleInitialPost,
  clearPendingPost,
  flushAll,
  pendingInitialPosts
};
