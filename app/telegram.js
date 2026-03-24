// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');

let bot = null;

const init = (env) => {
  bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });
};

const setStartMessage = ({ env, db, template, debounce, cleanup }) => {
  let startMessageId = env.START_MESSAGE_ID || db.getSystemValue('start_message_id');

  let hasUsers = false;
  try {
    const users = require('../config/users.json');
    hasUsers = Object.keys(users).length > 0;
  } catch {}

  const getStatus = () => {
    try {
      db.getMessageCount();
      return 'ok';
    } catch {
      return 'error';
    }
  };

  const formatTime = () => {
    const { locale, options } = template.labels.timeFormat;
    return new Date().toLocaleString(locale, options);
  };

  const getHealthData = () => ({
    status: getStatus(),
    uptime: Math.floor(process.uptime() / 60) + ' minutes',
    pendingPosts: debounce.pendingInitialPosts.size,
    pendingDeletes: cleanup.cleanupTimers.size,
    totalMessages: db.getMessageCount(),
    templateConfig: template.customConfigStatus,
    hasUsers: hasUsers ? 'yes' : 'no',
    lastUpdate: formatTime()
  });

  const updateMessage = async () => {
    const healthData = getHealthData();
    const message = template.renderStartMessage(healthData);

    try {
      if (startMessageId) {
        await bot.editMessageText(message, {
          chat_id: env.TELEGRAM_CHAT_ID,
          message_id: startMessageId,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        logger.debug('Start message updated', { messageId: startMessageId });
      } else {
        const sentMessage = await bot.sendMessage(env.TELEGRAM_CHAT_ID, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          message_thread_id: env.TELEGRAM_THREAD_ID ? parseInt(env.TELEGRAM_THREAD_ID, 10) : undefined
        });
        startMessageId = sentMessage.message_id;
        db.setSystemValue('start_message_id', startMessageId);
        logger.info('Start message sent', { messageId: startMessageId });
      }
    } catch (error) {
      if (error.response && error.response.body && error.response.body.description === 'Bad Request: message is not modified') {
        logger.info('Start message is not modified, skipping update');
      } else {
        logger.error('Failed to update start message', { error: error.message });
      }
    }
  };

  if (env.TELEGRAM_CHAT_ID) {
    updateMessage();
    setInterval(updateMessage, 60000);
  }
};

const sendNotification = async ({ message, taskId, taskNumber, chatId, threadId }) => {
  try {
    const options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (threadId) {
      options.message_thread_id = parseInt(threadId, 10);
    }

    const sentMessage = await bot.sendMessage(chatId, message, options);
    const db = require('./database');
    db.setMessageId(taskId, sentMessage.message_id);

    logger.info(`Sent to Telegram`, { taskNumber, messageId: sentMessage.message_id });
    return sentMessage.message_id;
  } catch (error) {
    logger.error(`Telegram send failed`, { taskNumber, error: error.message });
    return null;
  }
};

const editNotification = async ({ message, taskId, taskNumber, chatId }) => {
  const db = require('./database');
  const messageId = db.getMessageId(taskId);
  if (!messageId) return null;

  try {
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    logger.info(`Edited in Telegram`, { taskNumber, messageId });
    return messageId;
  } catch (error) {
    // noop
    if (error.message?.includes('message is not modified')) {
      logger.info(`Message unchanged, skipped edit`, { taskNumber });
      return messageId;
    }
    logger.error(`Telegram edit failed`, { taskNumber, error: error.message });
    return null;
  }
};

const deleteNotification = async ({ messageId, chatId }) => {
  try {
    await bot.deleteMessage(chatId, messageId);
    logger.info(`Deleted from Telegram`, { messageId });
    return true;
  } catch (error) {
    logger.error(`Telegram delete failed`, { messageId, error: error.message });
    return false;
  }
};

const sendDm = async ({ telegramUserId, message }) => {
  try {
    await bot.sendMessage(telegramUserId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    logger.info('DM sent', { telegramUserId });
    return true;
  } catch (error) {
    logger.warn('DM send failed (user may not have started bot)', {
      telegramUserId,
      error: error.message
    });
    return false;
  }
};

module.exports = {
  init,
  setStartMessage,
  sendNotification,
  editNotification,
  deleteNotification,
  sendDm
};
