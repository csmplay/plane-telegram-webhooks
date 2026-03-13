// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const logger = require('./logger');

const cache = new Map();

const apiGet = async (url, apiKey) => {
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`Plane API error: ${res.status}`);
  return res.json();
};

const getUserDisplayName = async (userId, baseUrl, workspaceSlug, apiKey) => {
  if (!userId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const cacheKey = `user:${workspaceSlug}:${userId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const data = await apiGet(`${baseUrl}/api/v1/workspaces/${workspaceSlug}/members/`, apiKey);
    if (!Array.isArray(data)) return null;

    const displayName = data.find(m => m.id === userId)?.display_name;
    if (displayName) cache.set(cacheKey, displayName);
    return displayName || null;
  } catch (err) {
    logger.warn(`Failed to fetch user display name`, { userId, error: err.message });
    return null;
  }
};

const getProjectIdentifier = async (projectId, baseUrl, workspaceSlug, apiKey) => {
  if (!projectId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const cacheKey = `project:${workspaceSlug}:${projectId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const data = await apiGet(`${baseUrl}/api/v1/workspaces/${workspaceSlug}/projects/`, apiKey);
    const results = data.results || data;
    if (!Array.isArray(results)) return null;

    const identifier = results.find(p => p.id === projectId)?.identifier;
    if (identifier) cache.set(cacheKey, identifier);
    return identifier || null;
  } catch (err) {
    logger.warn(`Failed to fetch project identifier`, { projectId, error: err.message });
    return null;
  }
};

module.exports = { getUserDisplayName, getProjectIdentifier };
