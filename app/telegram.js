// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const { getHealthData } = require('./health');

let bot = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const telegramCall = async (fn, context = {}) => {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.message?.includes('429 Too Many Requests');
      const isServerError = error.message?.includes('500') || error.message?.includes('502') || error.message?.includes('503');
      const isConnectionError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT') || error.message?.includes('socket');

      if ((isRateLimit || isServerError || isConnectionError) && attempt < MAX_ATTEMPTS) {
        let waitMs = 1000 * attempt;

        if (isRateLimit) {
          const match = error.message.match(/retry after (\d+)/);
          if (match) waitMs = parseInt(match[1], 10) * 1000;
        }

        logger.warn(`Telegram API retry (attempt ${attempt}/${MAX_ATTEMPTS})`, {
          ...context,
          waitMs,
          error: error.message
        });
        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }
};

const init = (env) => {
  bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });
};

const setStartMessage = ({ env, db, template, debounce, cleanup }) => {
  let startMessageId = env.START_MESSAGE_ID || db.getSystemValue('start_message_id');

  const updateMessage = async () => {
    const healthData = getHealthData({ db, debounce, cleanup, template, pretty: true });
    const message = template.render(template.startMessageLines, healthData);

    try {
      if (startMessageId) {
        await telegramCall(
          () => bot.editMessageText(message, {
            chat_id: env.TELEGRAM_CHAT_ID,
            message_id: startMessageId,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          }),
          { action: 'editStartMessage' }
        );
        logger.debug('Start message updated', { messageId: startMessageId });
      } else {
        const sentMessage = await telegramCall(
          () => bot.sendMessage(env.TELEGRAM_CHAT_ID, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            message_thread_id: env.TELEGRAM_THREAD_ID ? parseInt(env.TELEGRAM_THREAD_ID, 10) : undefined
          }),
          { action: 'sendStartMessage' }
        );
        startMessageId = sentMessage.message_id;
        db.setSystemValue('start_message_id', startMessageId);
        logger.info('Start message sent', { messageId: startMessageId });
      }
    } catch (error) {
      if (error.response && error.response.body && error.response.body.description === 'Bad Request: message is not modified') {
        logger.info('Start message is not modified, skipping update');
      } else {
        logger.error('Failed to update start message', { error: error.message, code: error.code, stack: error.stack });
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

    const sentMessage = await telegramCall(
      () => bot.sendMessage(chatId, message, options),
      { action: 'sendNotification', taskNumber }
    );
    const db = require('./database');
    db.setMessageId(taskId, sentMessage.message_id);

    logger.info(`Sent to Telegram`, { taskNumber, messageId: sentMessage.message_id });
    return sentMessage.message_id;
  } catch (error) {
    logger.error(`Telegram send failed`, { taskNumber, error: error.message, code: error.code });
    return null;
  }
};

const editNotification = async ({ message, taskId, taskNumber, chatId }) => {
  const db = require('./database');
  const messageId = db.getMessageId(taskId);
  if (!messageId) return null;

  try {
    await telegramCall(
      () => bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      { action: 'editNotification', taskNumber }
    );

    logger.info(`Edited in Telegram`, { taskNumber, messageId });
    return messageId;
  } catch (error) {
    // noop
    if (error.message?.includes('message is not modified')) {
      logger.info(`Message unchanged, skipped edit`, { taskNumber });
      return messageId;
    }
    logger.error(`Telegram edit failed`, { taskNumber, error: error.message, code: error.code });
    return null;
  }
};

const deleteNotification = async ({ messageId, chatId }) => {
  try {
    await telegramCall(
      () => bot.deleteMessage(chatId, messageId),
      { action: 'deleteNotification', messageId }
    );
    logger.info(`Deleted from Telegram`, { messageId });
    return true;
  } catch (error) {
    logger.error(`Telegram delete failed`, { messageId, error: error.message, code: error.code });
    return false;
  }
};

const sendDm = async ({ telegramUserId, message, label }) => {
  try {
    await telegramCall(
      () => bot.sendMessage(telegramUserId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      { action: 'sendDm', telegramUserId }
    );
    logger.info('DM sent', { telegramUserId, label });
    return true;
  } catch (error) {
    logger.warn('DM send failed (user may not have started bot)', {
      telegramUserId,
      error: error.message
    });
    return false;
  }
};

const setupCommands = (template) => {
  bot.onText(/\/start/, async (msg) => {
    const message = template.render(template.startLines, {});
    try {
      await telegramCall(
        () => bot.sendMessage(msg.chat.id, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        { action: 'startCommand' }
      );
    } catch (error) {
      logger.error('Failed to send /start response', { error: error.message });
    }
  });

  bot.on('polling_error', (error) => {
    logger.warn('Bot polling error', { code: error.code, message: error.message });
  });

  bot.startPolling();
  logger.info('Bot polling started');
};

module.exports = {
  init,
  setStartMessage,
  sendNotification,
  editNotification,
  deleteNotification,
  sendDm,
  setupCommands
};
