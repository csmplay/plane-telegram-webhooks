// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const truncateText = (text, maxLength) => {
  if (!text || text.length <= maxLength) return text;

  // Find a safe cut point that doesn't break URLs
  let cut = maxLength;
  const urlAt = text.lastIndexOf('http', cut);
  if (urlAt !== -1 && urlAt > cut - 60) {
    // We'd cut inside a URL — include the full URL then cut
    const urlEnd = text.indexOf(' ', urlAt);
    cut = urlEnd !== -1 ? urlEnd : text.length;
  }

  return text.substring(0, cut).trimEnd() + (cut < text.length ? '...' : '');
};

const normalizeDescription = (htmlDescription) => {
  if (!htmlDescription) return '';

  const normalized = htmlDescription
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<strong(?:\s[^>]*)?>/gi, '<b>')
    .replace(/<\/strong>/gi, '</b>')
    .replace(/<em(?:\s[^>]*)?>/gi, '<i>')
    .replace(/<\/em>/gi, '</i>')
    .replace(/<u(?:\s[^>]*)?>/gi, '<u>')
    .replace(/<\/u>/gi, '</u>')
    .replace(/<s(?:\s[^>]*)?>/gi, '<s>')
    .replace(/<\/s>/gi, '</s>')
    .replace(/<code(?:\s[^>]*)?>/gi, '<code>')
    .replace(/<\/code>/gi, '</code>')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol|div|image-component)[^>]*>/gi, '')
    .replace(/<(?!\/?(b|i|u|s|code)\b)[^>]+>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return truncateText(normalized, 100);
};

const formatDate = (dateString, dateFormat = {}) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  const locale = dateFormat.locale || 'en-US';
  const options = dateFormat.options || { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString(locale, options);
};

const translatePriority = (priority, labels = {}) => {
  return (labels.priorities || {})[priority] || '';
};

const translateState = (stateGroup, labels = {}) => {
  return (labels.states || {})[stateGroup] || '';
};

const generateTaskNumber = (projectIdentifier, sequenceId) => {
  return `${projectIdentifier || 'TASK'}-${sequenceId || '?'}`;
};

const formatArray = (arr, key) => arr?.filter(Boolean).map(item => item[key]).join(', ') || '';

module.exports = {
  escapeHtml,
  normalizeDescription,
  formatDate,
  translatePriority,
  translateState,
  generateTaskNumber,
  formatArray
};
