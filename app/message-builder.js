// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const template = require('./template');
const { getTelegramUserId } = require('./users');
const {
  escapeHtml,
  formatDate,
  formatArray,
  translatePriority,
  translateState,
  generateTaskNumber,
  sanitizeRichHtml,
  resolvePlaneImages
} = require('./formatters');

const formatUserMention = (user) => {
  const tgId = getTelegramUserId(user);
  const escaped = escapeHtml(user.display_name);
  return tgId ? `<a href="tg://user?id=${tgId}">${escaped}</a>` : escaped;
};

const buildMessage = ({ issue, activity, projectIdentifier, baseUrl, workspaceSlug }) => {
  const { labels } = template;

  const stateGroup = issue.state?.group || 'backlog';
  const stateEmoji = labels.stateEmojis[stateGroup] || labels.stateEmojis.default;

  const taskNumber = generateTaskNumber(projectIdentifier, issue.sequence_id);
  const taskName = escapeHtml(issue.name);
  let header;

  if (issue.sequence_id && workspaceSlug && projectIdentifier) {
    const issueUrl = `${baseUrl}/${workspaceSlug}/browse/${projectIdentifier}-${issue.sequence_id}`;
    header = labels.header.withLink
      .replace('{issueUrl}', issueUrl)
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName);
  } else {
    header = labels.header.withoutLink
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName);
  }

  const start = formatDate(issue.start_date, labels.dateFormat);
  const end = formatDate(issue.target_date, labels.dateFormat);

  let dateLabel = '';
  let date = '';
  if (start && end) {
    dateLabel = labels.dateLabels.range || 'Range';
    date = labels.deadline.range
      .replace('{start}', escapeHtml(start))
      .replace('{end}', escapeHtml(end));
  } else if (end) {
    dateLabel = labels.dateLabels.target || labels.dateLabels.deadline;
    date = labels.deadline.target
      .replace('{end}', escapeHtml(end));
  } else if (start) {
    dateLabel = labels.dateLabels.start;
    date = labels.deadline.start
      .replace('{start}', escapeHtml(start));
  }

  const assignees = issue.assignees?.length
    ? issue.assignees.map(formatUserMention).join(', ')
    : '';

  const creator = activity.originalCreator
    ? escapeHtml(activity.originalCreator)
    : '';

  return template.render(template.lines, {
    header,
    description: issue.description || labels.noDescription,
    dateLabel,
    date,
    state: translateState(stateGroup, labels),
    priority: translatePriority(issue.priority, labels),
    labels: escapeHtml(formatArray(issue.labels, 'name')),
    assignees,
    creator
  });
};

const buildRichHtml = async ({ issue, activity, projectIdentifier, baseUrl, workspaceSlug, apiKey, mediaBaseUrl }) => {
  const { labels } = template;

  const stateGroup = issue.state?.group || 'backlog';
  const stateEmoji = labels.stateEmojis[stateGroup] || labels.stateEmojis.default;

  const taskName = escapeHtml(issue.name);
  let header;

  if (issue.sequence_id && workspaceSlug && projectIdentifier) {
    const issueUrl = `${baseUrl}/${workspaceSlug}/browse/${projectIdentifier}-${issue.sequence_id}`;
    header = labels.header.withLink
      .replace('{issueUrl}', issueUrl)
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName);
  } else {
    header = labels.header.withoutLink
      .replace('{stateEmoji}', stateEmoji)
      .replace('{taskName}', taskName);
  }

  const start = formatDate(issue.start_date, labels.dateFormat);
  const end = formatDate(issue.target_date, labels.dateFormat);

  let dateLabel = '';
  let date = '';
  if (start && end) {
    dateLabel = labels.dateLabels.range || 'Range';
    date = labels.deadline.range
      .replace('{start}', escapeHtml(start))
      .replace('{end}', escapeHtml(end));
  } else if (end) {
    dateLabel = labels.dateLabels.target || labels.dateLabels.deadline;
    date = labels.deadline.target
      .replace('{end}', escapeHtml(end));
  } else if (start) {
    dateLabel = labels.dateLabels.start;
    date = labels.deadline.start
      .replace('{start}', escapeHtml(start));
  }

  const assignees = issue.assignees?.length
    ? issue.assignees.map(formatUserMention).join(', ')
    : '';

  const creator = activity.originalCreator
    ? escapeHtml(activity.originalCreator)
    : '';

  const rawHtml = issue.description_html || issue.description || labels.noDescription;
  const resolvedHtml = await resolvePlaneImages(rawHtml, baseUrl, workspaceSlug, apiKey, mediaBaseUrl);
  const description = sanitizeRichHtml(resolvedHtml);

  const html = template.render(template.richLines, {
    header,
    description: `<details><summary>Описание задачи</summary>${description}</details>`,
    dateLabel,
    date,
    state: translateState(stateGroup, labels),
    priority: translatePriority(issue.priority, labels),
    labels: escapeHtml(formatArray(issue.labels, 'name')),
    assignees,
    creator
  });

  return html;
};

module.exports = { buildMessage, buildRichHtml };
