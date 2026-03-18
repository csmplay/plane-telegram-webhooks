// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const crypto = require('crypto');
const { buildMessage } = require('./message-builder');
const { generateTaskNumber, normalizeDescription } = require('./formatters');
const telegramService = require('./telegram');
const debounce = require('./debounce');
const cleanup = require('./cleanup');
const db = require('./database');
const logger = require('./logger');
const planeApi = require('./plane-api');

const REQUEST_CACHE_MAX = 1000;
const REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
const requestCache = new Map();

const addToCache = (key) => {
  if (requestCache.size >= REQUEST_CACHE_MAX) {
    const firstKey = requestCache.keys().next().value;
    requestCache.delete(firstKey);
  }
  requestCache.set(key, Date.now());
  setTimeout(() => requestCache.delete(key), REQUEST_CACHE_TTL_MS);
};

const checkSignature = (signature, body, secret) => {
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
};

const parseBody = (body) => {
  try {
    const parsed = JSON.parse(body.toString());
    const { event, action, activity, data } = parsed;

    if (!data) return null;

    const description = data.description_html
      ? normalizeDescription(data.description_html)
      : (data.description_stripped || '');

    return {
      event,
      action,
      activity,
      project: data.project || parsed.project,
      created_by: data.created_by || parsed.created_by,
      issue: {
        name: data.name,
        description,
        priority: data.priority,
        labels: data.labels,
        assignees: data.assignees,
        updatedAt: data.updated_at,
        id: data.id,
        sequence_id: data.sequence_id,
        state: data.state,
        start_date: data.start_date,
        target_date: data.target_date
      }
    };
  } catch {
    return null;
  }
};

const verifySignature = (secret) => (req, res, next) => {
  if (!checkSignature(req.headers['x-plane-signature'], req.body, secret)) {
    logger.warn('Webhook signature verification failed');
    return res.status(403).send('Invalid signature');
  }

  logger.dumpRawWebhook(req.body);
  next();
};

const parsePayload = (req, res, next) => {
  const payload = parseBody(req.body);
  if (!payload) {
    logger.warn('Failed to parse webhook payload');
    return res.status(400).send('Invalid payload');
  }

  res.locals.payload = payload;
  next();
};

const checkDuplicate = (req, res, next) => {
  const action = res.locals.payload.action;
  res.locals.action = action;

  if (action !== 'created') {
    return next();
  }

  const requestId = `${res.locals.payload.issue.id}-${action}`;

    if (requestCache.has(requestId)) {
    return res.sendStatus(200);
  }

  addToCache(requestId);
  next();
};

const handleNotification = (config) => async (req, res) => {
  try {
    const { payload, action } = res.locals;

    if (payload.event !== 'issue') {
      logger.warn(`Received unknown event: ${payload.event}`);
      return res.sendStatus(200);
    }    const stateGroup = payload.issue.state?.group || 'backlog';
    const isFinished = stateGroup === 'completed' || stateGroup === 'cancelled';

    let projectIdentifier = null;
    let creatorName = null;

    if (config.baseUrl && config.apiKey && config.workspaceSlug) {
      if (payload.project) {
        projectIdentifier = await planeApi.getProjectIdentifier(
          payload.project,
          config.baseUrl,
          config.workspaceSlug,
          config.apiKey
        );
      }

      if (payload.created_by) {
        creatorName = await planeApi.getUserDisplayName(
          payload.created_by,
          config.baseUrl,
          config.workspaceSlug,
          config.apiKey
        );
      }
    }

    const taskNumber = generateTaskNumber(projectIdentifier, payload.issue.sequence_id);

    logger.debug(`Webhook received: ${action.toUpperCase()}`, {
      taskNumber,
      issue: payload.issue.name,
      state: stateGroup
    });

    if (action === 'created' && isFinished) {
      logger.info(`Skipped posting for finished task`, { taskNumber, state: stateGroup });
      return res.sendStatus(200);
    }

    const activity = creatorName
      ? { ...payload.activity, originalCreator: creatorName }
      : payload.activity;

    const message = buildMessage({
      issue: payload.issue,
      activity,
      projectIdentifier,
      baseUrl: config.baseUrl,
      workspaceSlug: config.workspaceSlug
    });

    if (action === 'created') {
      debounce.scheduleInitialPost({
        taskNumber,
        message,
        chatId: config.chatId,
        threadId: config.threadId
      });
      logger.info(`Scheduled initial post`, { taskNumber });
      return res.sendStatus(200);
    }

    const pendingPost = debounce.pendingInitialPosts.get(taskNumber);

    if (pendingPost) {
      if (isFinished) {
        debounce.clearPendingPost(taskNumber);
        logger.info(`Cancelled pending post for finished task`, { taskNumber });
      } else {
        debounce.pendingInitialPosts.set(taskNumber, { ...pendingPost, message });
        logger.info(`Updated pending post snapshot`, { taskNumber });
      }

      return res.sendStatus(200);
    }

    const postedMessageId = db.getMessageId(taskNumber);

    if (postedMessageId) {
      await telegramService.editNotification({
        message,
        taskNumber,
        chatId: config.chatId
      });
      logger.info(`Edited existing message`, { taskNumber });

      if (isFinished) {
        cleanup.scheduleCleanup({ taskNumber, chatId: config.chatId });
      } else {
        cleanup.cancelCleanup(taskNumber);
      }
    } else if (!isFinished) {
      debounce.scheduleInitialPost({
        taskNumber,
        message,
        chatId: config.chatId,
        threadId: config.threadId
      });
      logger.info(`Scheduled post`, { taskNumber });
    } else {
      logger.info(`Skipped scheduling post for finished task`, { taskNumber, state: stateGroup });
    }

    return res.sendStatus(200);
  } catch (error) {
    logger.error('Webhook processing failed', { error: error.message });
    return res.sendStatus(200);
  }
};

module.exports = {
  verifySignature,
  parsePayload,
  checkDuplicate,
  handleNotification
};
