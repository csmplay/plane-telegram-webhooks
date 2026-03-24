// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const crypto = require('crypto');
const { buildMessage } = require('./message-builder');
const { generateTaskNumber, normalizeDescription } = require('./formatters');
const telegramService = require('./telegram');
const debounce = require('./debounce');
const cleanup = require('./cleanup');
const dm = require('./dm');
const db = require('./database');
const logger = require('./logger');
const planeApi = require('./plane-api');

const REQUEST_CACHE_MAX = 1000;
const REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
const requestCache = new Map();

const getEventTimestampMs = (issue) => {
  const ts = issue?.updatedAt || issue?.createdAt;
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return ms;
};

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
      webhookId: parsed.webhook_id || null,
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
        createdAt: data.created_at,
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

  const webhookId = res.locals.payload.webhookId;
  if (action !== 'created') return next();

  const requestId = webhookId ? String(webhookId) : `${res.locals.payload.issue.id}-${action}`;

  if (requestCache.has(requestId)) return res.sendStatus(200);

  addToCache(requestId);
  res.locals.dedupRequestId = requestId;
  next();
};

const handleNotification = (config) => async (req, res) => {
  try {
    const { payload, action } = res.locals;

    if (payload.event !== 'issue') {
      logger.warn(`Received unknown event: ${payload.event}`);
      return res.sendStatus(200);
    }

    const stateGroup = payload.issue.state?.group || 'backlog';
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

    const taskId = payload.issue?.id ? String(payload.issue.id) : null;
    const taskNumber = generateTaskNumber(projectIdentifier, payload.issue.sequence_id);
    const resolvedTaskId = taskId || taskNumber;

    if (taskId && resolvedTaskId !== taskNumber) {
      const existingStable = db.getMessageId(taskId);
      if (!existingStable) {
        const existingLegacy = db.getMessageId(taskNumber);
        if (existingLegacy) {
          db.setMessageId(taskId, existingLegacy);
          db.deleteMessageId(taskNumber);
          db.migrateLastEventTs(taskNumber, taskId);
          logger.info('Migrated task mapping to stable key', {
            taskId,
            taskNumber
          });
        }
      }
    }

    const eventTsMs = getEventTimestampMs(payload.issue);
    if (eventTsMs !== null) {
      const shouldApply = db.trySetLastEventTs(resolvedTaskId, eventTsMs);
      if (!shouldApply) return res.sendStatus(200);
    }

    logger.debug(`Webhook received: ${action.toUpperCase()}`, {
      taskNumber,
      issue: payload.issue.name,
      state: stateGroup
    });

    if (action === 'updated') {
      dm.handleUpdate(
        payload.issue,
        payload.activity,
        config,
        projectIdentifier
      );
    }

    if (action === 'created' && isFinished) {
      logger.info(`Skipped posting for finished task`, { taskNumber, state: stateGroup });
      return res.sendStatus(200);
    }

    const existingMessageId = db.getMessageId(resolvedTaskId);

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
      if (existingMessageId) {
        await telegramService.editNotification({
          message,
          taskId: resolvedTaskId,
          taskNumber,
          chatId: config.chatId
        });

        if (isFinished) {
          cleanup.scheduleCleanup({ taskId: resolvedTaskId, taskNumber, chatId: config.chatId });
        } else {
          cleanup.cancelCleanup(resolvedTaskId);
        }

        logger.info('Edited existing message on created action', { taskNumber });
        return res.sendStatus(200);
      }

      debounce.scheduleInitialPost({
        taskId: resolvedTaskId,
        taskNumber,
        message,
        chatId: config.chatId,
        threadId: config.threadId
      });
      logger.info(`Scheduled initial post`, { taskNumber });
      return res.sendStatus(200);
    }

    const pendingPost = debounce.pendingInitialPosts.get(resolvedTaskId);

    if (pendingPost) {
      if (isFinished) {
        debounce.clearPendingPost(resolvedTaskId);
        logger.info(`Cancelled pending post for finished task`, { taskNumber });
      } else {
        debounce.pendingInitialPosts.set(resolvedTaskId, { ...pendingPost, message });
        logger.info(`Updated pending post snapshot`, { taskNumber });
      }

      return res.sendStatus(200);
    }

    const postedMessageId = db.getMessageId(resolvedTaskId);

    if (postedMessageId) {
      await telegramService.editNotification({
        message,
        taskId: resolvedTaskId,
        taskNumber,
        chatId: config.chatId
      });

      if (isFinished) {
        cleanup.scheduleCleanup({ taskId: resolvedTaskId, taskNumber, chatId: config.chatId });
      } else {
        cleanup.cancelCleanup(resolvedTaskId);
      }
    } else if (!isFinished) {
      debounce.scheduleInitialPost({
        taskId: resolvedTaskId,
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
    logger.error('Webhook processing failed', { error: error.message, stack: error.stack });
    if (res.locals.dedupRequestId) {
      requestCache.delete(res.locals.dedupRequestId);
    }
    return res.status(500).send('Webhook processing failed');
  }
};

module.exports = {
  verifySignature,
  parsePayload,
  checkDuplicate,
  handleNotification
};
