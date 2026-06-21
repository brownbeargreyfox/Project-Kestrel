import { Router } from 'express';

const router = Router();
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

function getOllamaBaseUrl() {
  const raw = process.env.KESTREL_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return DEFAULT_OLLAMA_BASE_URL;
    return url.origin;
  } catch {
    return DEFAULT_OLLAMA_BASE_URL;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getOllamaVersion(baseUrl) {
  const response = await fetchWithTimeout(`${baseUrl}/api/version`, {
    headers: { Accept: 'application/json' },
  }, 1500);

  if (!response.ok) {
    throw new Error(`Ollama version check failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function getOllamaModels(baseUrl) {
  const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {
    headers: { Accept: 'application/json' },
  }, 2500);

  if (!response.ok) {
    throw new Error(`Ollama model list failed with HTTP ${response.status}`);
  }

  return response.json();
}

router.get('/providers', async (req, res) => {
  res.json({
    ok: true,
    providers: [
      {
        id: 'local-ollama',
        title: 'Local Ollama',
        type: 'ollama',
        baseUrl: getOllamaBaseUrl(),
        enabled: process.env.KESTREL_OLLAMA_ENABLED === 'true',
        defaultModel: process.env.KESTREL_OLLAMA_MODEL || null,
        serverSideOnly: true,
      },
    ],
  });
});

router.get('/ollama/status', async (req, res) => {
  const baseUrl = getOllamaBaseUrl();
  const enabled = process.env.KESTREL_OLLAMA_ENABLED === 'true';
  const startedAt = Date.now();

  if (!enabled) {
    return res.json({
      ok: true,
      provider: 'local-ollama',
      enabled: false,
      reachable: false,
      baseUrl,
      elapsedMs: Date.now() - startedAt,
      message: 'Set KESTREL_OLLAMA_ENABLED=true on the Kestrel server to enable local Ollama checks.',
    });
  }

  try {
    const version = await getOllamaVersion(baseUrl);
    return res.json({
      ok: true,
      provider: 'local-ollama',
      enabled: true,
      reachable: true,
      baseUrl,
      version: version?.version ?? null,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      provider: 'local-ollama',
      enabled: true,
      reachable: false,
      baseUrl,
      error: error?.message ?? 'Ollama is not reachable from the Kestrel server',
      elapsedMs: Date.now() - startedAt,
    });
  }
});

router.get('/ollama/models', async (req, res) => {
  const baseUrl = getOllamaBaseUrl();
  const enabled = process.env.KESTREL_OLLAMA_ENABLED === 'true';
  const startedAt = Date.now();

  if (!enabled) {
    return res.status(403).json({
      ok: false,
      provider: 'local-ollama',
      enabled: false,
      baseUrl,
      error: 'Local Ollama provider is disabled. Set KESTREL_OLLAMA_ENABLED=true on the Kestrel server.',
      elapsedMs: Date.now() - startedAt,
    });
  }

  try {
    const payload = await getOllamaModels(baseUrl);
    return res.json({
      ok: true,
      provider: 'local-ollama',
      enabled: true,
      baseUrl,
      defaultModel: process.env.KESTREL_OLLAMA_MODEL || null,
      models: Array.isArray(payload?.models) ? payload.models : [],
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      provider: 'local-ollama',
      enabled: true,
      baseUrl,
      error: error?.message ?? 'Failed to list Ollama models',
      elapsedMs: Date.now() - startedAt,
    });
  }
});

export default router;
