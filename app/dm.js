// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const template = require('./template');
const telegramService = require('./telegram');
const { getTelegramUserId } = require('./users');
const {
  escapeHtml,
  formatDate,
  translatePriority,
  translateState
} = require('./formatters');
const logger = require('./logger');
const planeApi = require('./plane-api');

const TRACKED_FIELDS = ['state_id', 'priority', 'assignee_ids', 'target_date'];
const DM_DEBOUNCE_MS = 60000;

const pendingDMs = new Map();
const processedActivities = new Set();
let generation = 0;

const resolveStateGroupFromId = async (stateId, projectId, config) => {
  if (!stateId || !config.baseUrl || !config.workspaceSlug || !config.apiKey || !projectId) {
    return null;
  }
  return planeApi.getStateGroup(stateId, projectId, config.baseUrl, config.workspaceSlug, config.apiKey);
};

const resolveAssigneeNames = async (userIds, issue, config) => {
  const nameMap = new Map();

  const issueAssigneeMap = new Map();
  for (const a of (issue.assignees || [])) {
    if (a?.id) issueAssigneeMap.set(a.id, a.display_name);
  }

  for (const id of userIds) {
    if (issueAssigneeMap.has(id)) {
      nameMap.set(id, issueAssigneeMap.get(id));
    } else if (config.baseUrl && config.workspaceSlug && config.apiKey) {
      const name = await planeApi.getUserDisplayName(
        id, config.baseUrl, config.workspaceSlug, config.apiKey
      );
      if (name) nameMap.set(id, name);
    }
  }

  return nameMap;
};

const buildChangeLines = (changes) => {
  const fallback = template.notSetFallback || '';
  return changes.map((change) => {
    switch (change.type) {
      case 'state': {
        const from = change.old === 'unknown'
          ? 'unknown'
          : escapeHtml(translateState(change.old, template.labels));
        const to = escapeHtml(translateState(change.new, template.labels)) || fallback;
        if (!from) return template.renderDMChange('stateNoOld', { to });
        return template.renderDMChange('state', { from, to });
      }

      case 'priority': {
        const from = escapeHtml(translatePriority(change.old, template.labels));
        const to = escapeHtml(translatePriority(change.new, template.labels)) || fallback;
        if (!from) return template.renderDMChange('priorityNoOld', { to });
        return template.renderDMChange('priority', { from, to });
      }

      case 'target_date': {
        const dateFormat = template.labels.dateFormat;
        const from = escapeHtml(formatDate(change.old, dateFormat));
        const to = escapeHtml(formatDate(change.new, dateFormat)) || fallback;
        if (!from) return template.renderDMChange('deadlineNoOld', { to });
        return template.renderDMChange('deadline', { from, to });
      }

      case 'assignees': {
        const from = (change.oldNames || [])
          .map(n => `<b>${escapeHtml(n)}</b>`)
          .join(', ');
        const to = (change.newNames || [])
          .map(n => `<b>${escapeHtml(n)}</b>`)
          .join(', ') || fallback;
        if (!from) return template.renderDMChange('assigneesNoOld', { to });
        return template.renderDMChange('assignees', { from, to });
      }

      default:
        return '';
    }
  }).filter(Boolean);
};

const buildDMMessage = (issue, changes, baseUrl, workspaceSlug, projectIdentifier) => {
  const taskName = escapeHtml(issue.name);

  let taskHeader = taskName;
  if (issue.sequence_id && workspaceSlug && projectIdentifier) {
    const issueUrl = `${baseUrl}/${workspaceSlug}/browse/${projectIdentifier}-${issue.sequence_id}`;
    taskHeader = `<a href="${issueUrl}">${taskName}</a>`;
  }

  const changeLines = buildChangeLines(changes);
  if (!changeLines.length) return null;

  return template.renderDM({
    taskName: taskHeader,
    changes: changeLines.join('\n')
  });
};

const handleUpdate = async (issue, activity, config, projectIdentifier) => {
  const field = activity?.field;
  if (!field || !TRACKED_FIELDS.includes(field)) return;

  const activityId = activity?.id;
  if (activityId && processedActivities.has(activityId)) return;
  if (activityId) {
    processedActivities.add(activityId);
    if (processedActivities.size > 1000) {
      const iter = processedActivities.values();
      for (let i = 0; i < 500; i++) processedActivities.delete(iter.next().value);
    }
  }

  const stateGroup = issue.state?.group || 'backlog';
  if ((stateGroup === 'completed' || stateGroup === 'cancelled') && field !== 'assignee_ids') return;

  let change;
  const uniqueUserIds = new Set();

  if (field === 'state_id') {
    const newStateGroup = issue.state?.group || null;
    const oldStateGroup = await resolveStateGroupFromId(
      activity.old_value, issue.project, config
    );
    if (oldStateGroup && newStateGroup && oldStateGroup === newStateGroup) return;
    if (!newStateGroup) return;
    change = { type: 'state', old: oldStateGroup || 'unknown', new: newStateGroup };
    for (const a of (issue.assignees || [])) {
      if (a?.id) uniqueUserIds.add(a.id);
    }

  } else if (field === 'priority') {
    const oldPriority = activity.old_value ?? null;
    const newPriority = activity.new_value ?? issue.priority ?? null;
    if (oldPriority === newPriority) return;
    change = { type: 'priority', old: oldPriority, new: newPriority };
    for (const a of (issue.assignees || [])) {
      if (a?.id) uniqueUserIds.add(a.id);
    }

  } else if (field === 'target_date') {
    const oldDate = activity.old_value || null;
    const newDate = activity.new_value || issue.target_date || null;
    if (oldDate === newDate) return;
    change = { type: 'target_date', old: oldDate, new: newDate };
    for (const a of (issue.assignees || [])) {
      if (a?.id) uniqueUserIds.add(a.id);
    }

  } else if (field === 'assignee_ids') {
    const oldIds = Array.isArray(activity.old_value) ? activity.old_value : [];
    const newIds = Array.isArray(activity.new_value) ? activity.new_value : [];

    const oldSet = new Set(oldIds);
    const newSet = new Set(newIds);

    if (oldSet.size === newSet.size && [...oldSet].every(id => newSet.has(id))) return;

    const allIds = [...new Set([...oldIds, ...newIds])];
    const removedIds = oldIds.filter(id => !newSet.has(id));
    const nameMap = await resolveAssigneeNames(allIds, issue, config);

    const oldNames = oldIds.map(id => nameMap.get(id) || id);
    const newNames = newIds.map(id => nameMap.get(id) || id);

    change = { type: 'assignees', oldNames, newNames };

    for (const a of (issue.assignees || [])) {
      if (a?.id) uniqueUserIds.add(a.id);
    }
    for (const id of removedIds) uniqueUserIds.add(id);
  }

  if (!change) return;

  for (const a of (issue.assignees || [])) {
    if (a?.id) uniqueUserIds.add(a.id);
  }

  for (const planeUserId of uniqueUserIds) {
    queueDM(planeUserId, issue, change, config, projectIdentifier);
  }
};

const queueDM = (telegramUserId, issue, change, config, projectIdentifier) => {
  const debounceKey = `issue:${issue.id}`;

  let entry = pendingDMs.get(debounceKey);
  if (!entry) {
    entry = {
      issue,
      changes: [],
      allAffectedIds: new Set(),
      config,
      projectIdentifier,
      gen: ++generation
    };
    pendingDMs.set(debounceKey, entry);

    entry.timeoutId = setTimeout(() => {
      sendPendingDM(debounceKey, entry.gen);
    }, DM_DEBOUNCE_MS);

    logger.info('Scheduled DM notification', {
      taskNumber: `${projectIdentifier}-${issue.sequence_id}`
    });
  }

  entry.allAffectedIds.add(telegramUserId);

  const existingIdx = entry.changes.findIndex(c => c.type === change.type);
  if (existingIdx !== -1) {
    const existing = entry.changes[existingIdx];
    if (change.type === 'assignees') {
      entry.changes[existingIdx] = { ...existing, newNames: change.newNames };
    } else {
      entry.changes[existingIdx] = { ...existing, new: change.new };
    }
  } else {
    entry.changes.push({ ...change, initialOldNames: change.oldNames });
  }
};

const sendPendingDM = async (debounceKey, gen) => {
  const entry = pendingDMs.get(debounceKey);
  if (!entry || entry.gen !== gen) return;
  pendingDMs.delete(debounceKey);

  entry.changes = entry.changes.filter(c => {
    if (c.type === 'assignees') {
      const oldSet = new Set(c.initialOldNames || []);
      const newSet = new Set(c.newNames || []);
      return oldSet.size !== newSet.size || ![...oldSet].every(n => newSet.has(n));
    }
    return c.old !== c.new;
  });

  if (!entry.changes.length) return;

  const message = buildDMMessage(
    entry.issue,
    entry.changes,
    entry.config.baseUrl,
    entry.config.workspaceSlug,
    entry.projectIdentifier
  );

  if (!message) return;

  const displayNames = new Map();
  for (const a of (entry.issue.assignees || [])) {
    if (a?.id && a?.display_name) displayNames.set(a.id, a.display_name);
  }

  const unresolvedIds = [...entry.allAffectedIds].filter(id => !displayNames.has(id));
  if (unresolvedIds.length) {
    const resolved = await resolveAssigneeNames(unresolvedIds, entry.issue, entry.config);
    for (const [id, name] of resolved) displayNames.set(id, name);
  }

  for (const planeUserId of entry.allAffectedIds) {
    const user = displayNames.has(planeUserId)
      ? { id: planeUserId, display_name: displayNames.get(planeUserId) }
      : { id: planeUserId, display_name: planeUserId };

    const telegramUserId = getTelegramUserId(user);
    if (!telegramUserId) continue;

    const ok = await telegramService.sendDm({
      telegramUserId,
      message
    });

    if (ok) {
      logger.debug('DM notification sent', {
        telegramUserId,
        task: entry.issue.name,
        changes: entry.changes.length
      });
    }
  }
};

module.exports = { handleUpdate, pendingDMs };
