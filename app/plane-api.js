// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const logger = require('./logger');
const cache = require('./cache');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiGet = async (url, apiKey) => {
  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 5000;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        redirect: 'follow',
        signal: controller.signal
      });

      if (res.ok) return res.json();

      const status = res.status;
      const isTransient = status === 429 || (status >= 500 && status <= 599);

      if (isTransient && attempt < MAX_ATTEMPTS) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null;
        const waitMs = retryAfterMs && Number.isFinite(retryAfterMs)
          ? retryAfterMs
          : Math.min(250 * attempt, 2000);

        lastError = new Error(`Plane API error: ${status}`);
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Plane API error: ${status}`);
    } catch (err) {
      lastError = err;

      const isAbort = err && err.name === 'AbortError';
      const isNetworkLike = err && (err.type === 'system' || err instanceof TypeError);

      if ((isAbort || isNetworkLike) && attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(250 * attempt, 1500));
        continue;
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Plane API request failed');
};

const getUserDisplayName = async (userId, baseUrl, workspaceSlug, apiKey) => {
  if (!userId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const cacheKey = `user:${workspaceSlug}:${userId}`;
  const cached = cache.get(cacheKey);
  if (cached !== cache.MISSING) return cached;

  try {
    const data = await apiGet(`${baseUrl}/api/v1/workspaces/${workspaceSlug}/members/`, apiKey);
    const results = Array.isArray(data) ? data : (data.results || data);
    if (!Array.isArray(results)) return null;

    for (const member of results) {
      if (member?.id && member?.display_name) {
        cache.set(`user:${workspaceSlug}:${member.id}`, member.display_name);
      }
    }

    const value = cache.get(cacheKey);
    if (value === cache.MISSING) {
      cache.set(cacheKey, null);
      return null;
    }
    return value;
  } catch (err) {
    logger.warn(`Failed to fetch user display name`, { userId, error: err.message });
    return null;
  }
};

const getProjectIdentifier = async (projectId, baseUrl, workspaceSlug, apiKey) => {
  if (!projectId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const cacheKey = `project:${workspaceSlug}:${projectId}`;
  const cached = cache.get(cacheKey);
  if (cached !== cache.MISSING) return cached;

  try {
    const data = await apiGet(`${baseUrl}/api/v1/workspaces/${workspaceSlug}/projects/`, apiKey);
    const results = data.results || data;
    if (!Array.isArray(results)) return null;

    const identifier = results.find(p => p.id === projectId)?.identifier || null;
    cache.set(cacheKey, identifier);
    return identifier;
  } catch (err) {
    logger.warn(`Failed to fetch project identifier`, { projectId, error: err.message });
    return null;
  }
};

const getProjectStates = async (projectId, baseUrl, workspaceSlug, apiKey) => {
  if (!projectId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const cacheKey = `project_states:${workspaceSlug}:${projectId}`;
  const cached = cache.get(cacheKey);
  if (cached !== cache.MISSING) return cached;

  try {
    const data = await apiGet(
      `${baseUrl}/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
      apiKey
    );
    const results = Array.isArray(data) ? data : (data.results || data);
    if (!Array.isArray(results)) {
      logger.warn(`Project states response is not an array`, { projectId });
      return null;
    }

    const stateMap = new Map();
    for (const state of results) {
      if (state?.id && state?.group) {
        stateMap.set(state.id, state.group);
      }
    }
    logger.debug(`Fetched project states`, { projectId, count: stateMap.size });
    cache.set(cacheKey, stateMap);
    return stateMap;
  } catch (err) {
    logger.warn(`Failed to fetch project states`, { projectId, error: err.message });
    return null;
  }
};

const getStateGroup = async (stateId, projectId, baseUrl, workspaceSlug, apiKey) => {
  if (!stateId || !projectId || !apiKey || !baseUrl || !workspaceSlug) return null;

  const stateMap = await getProjectStates(projectId, baseUrl, workspaceSlug, apiKey);
  if (!stateMap) return null;

  const group = stateMap.get(stateId) || null;
  if (!group) {
    logger.warn(`State not found in project`, { stateId, projectId });
  }
  return group;
};

const getIssueDetails = async (issueId, projectId, baseUrl, workspaceSlug, apiKey) => {
  if (!issueId || !apiKey || !baseUrl || !workspaceSlug || !projectId) return null;

  const cacheKey = `issue:${workspaceSlug}:${issueId}`;
  const cached = cache.get(cacheKey);
  if (cached !== cache.MISSING) return cached;

  try {
    const data = await apiGet(
      `${baseUrl}/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/work-items/${issueId}/?expand=assignees`,
      apiKey
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    logger.warn(`Failed to fetch issue details`, { issueId, error: err.message });
    return null;
  }
};

module.exports = { getUserDisplayName, getProjectIdentifier, getStateGroup, getIssueDetails };
