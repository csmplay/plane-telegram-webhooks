// SPDX-FileCopyrightText: 2026 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

const logger = require('./logger');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const fetchAssetUrl = async (uuid, baseUrl, workspaceSlug, apiKey) => {
  const url = `${baseUrl}/api/v1/workspaces/${workspaceSlug}/assets/${uuid}/`;
  logger.debug('Media: fetching asset metadata', { uuid, url: url.substring(0, 120) });
  const resp = await fetch(url, {
    headers: { 'x-api-key': apiKey }
  });
  logger.debug('Media: asset metadata response', { uuid, status: resp.status });
  if (!resp.ok) return null;
  const data = await resp.json();
  logger.debug('Media: asset metadata', { uuid, hasAssetUrl: !!data.asset_url, keys: Object.keys(data) });
  return data.asset_url || null;
};

const fetchImage = async (url, uuid) => {
  logger.debug('Media: downloading image', { uuid, url: url.substring(0, 120) });
  const resp = await fetch(url);
  logger.debug('Media: image download response', { uuid, status: resp.status, contentType: resp.headers.get('content-type') });
  if (!resp.ok) return null;
  const contentType = resp.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await resp.arrayBuffer());
  logger.debug('Media: image downloaded', { uuid, size: buffer.length, contentType });
  return { buffer, contentType };
};

const getOrFetch = async (uuid, baseUrl, workspaceSlug, apiKey) => {
  const cached = cache.get(uuid);
  if (cached) {
    logger.debug('Media: cache hit', { uuid });
    return cached;
  }

  logger.debug('Media: cache miss', { uuid });
  const assetUrl = await fetchAssetUrl(uuid, baseUrl, workspaceSlug, apiKey);
  if (!assetUrl) {
    logger.warn('Media: no asset URL returned', { uuid });
    return null;
  }

  const image = await fetchImage(assetUrl, uuid);
  if (!image) {
    logger.warn('Media: image download failed', { uuid });
    return null;
  }

  const entry = { ...image, timeoutId: null };
  entry.timeoutId = setTimeout(() => {
    cache.delete(uuid);
    logger.debug('Media: cache expired', { uuid });
  }, CACHE_TTL_MS);
  cache.set(uuid, entry);

  return image;
};

const setupMediaRoute = (app, config) => {
  logger.info('Media: setting up /media route', { hasBaseUrl: !!config.baseUrl, hasApiKey: !!config.apiKey, hasWorkspaceSlug: !!config.workspaceSlug });

  app.get('/media/:uuid.:ext', async (req, res) => {
    const { uuid } = req.params;
    logger.debug('Media: request received', { uuid, ip: req.ip });

    if (!/^[0-9a-f-]{36}$/.test(uuid)) {
      logger.warn('Media: invalid UUID format', { uuid });
      return res.status(400).send('Invalid UUID');
    }

    if (!config.baseUrl || !config.apiKey || !config.workspaceSlug) {
      logger.warn('Media: proxy not configured', { hasBaseUrl: !!config.baseUrl, hasApiKey: !!config.apiKey, hasWorkspaceSlug: !!config.workspaceSlug });
      return res.status(503).send('Media proxy not configured');
    }

    try {
      const image = await getOrFetch(uuid, config.baseUrl, config.workspaceSlug, config.apiKey);
      if (!image) {
        logger.warn('Media: asset not found', { uuid });
        return res.status(404).send('Asset not found');
      }
      res.set('Content-Type', image.contentType);
      res.set('Cache-Control', 'public, max-age=300');
      res.send(image.buffer);
      logger.debug('Media: served', { uuid, size: image.buffer.length, contentType: image.contentType });
    } catch (err) {
      logger.error('Media: proxy error', { uuid, error: err.message, stack: err.stack });
      res.status(500).send('Proxy error');
    }
  });
};

module.exports = { setupMediaRoute };
