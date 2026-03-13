// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const TelegramBot = require('node-telegram-bot-api');
const db = require('./database');
const logger = require('./logger');

let bot = null;

const init = () => {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
};

const sendNotification = async ({ message, taskNumber, chatId, threadId }) => {
  try {
    const options = {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };

    if (threadId) {
      options.message_thread_id = parseInt(threadId, 10);
    }

    const sentMessage = await bot.sendMessage(chatId, message, options);
    db.setMessageId(taskNumber, sentMessage.message_id);

    logger.info(`Sent to Telegram`, { taskNumber, messageId: sentMessage.message_id });
    return sentMessage.message_id;
  } catch (error) {
    logger.error(`Telegram send failed`, { taskNumber, error: error.message });
    return null;
  }
};

const editNotification = async ({ message, taskNumber, chatId }) => {
  const messageId = db.getMessageId(taskNumber);
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

module.exports = {
  init,
  sendNotification,
  editNotification,
  deleteNotification
};
