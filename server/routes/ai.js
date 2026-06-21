import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const router = Router();
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const AUDIT_FILE = path.join(STATE_DIR, 'audit-log.jsonl');

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

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function sanitizeText(value, maxLength = 8000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function hashText(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex');
}

function getDefaultModel() {
  return process.env.KESTREL_OLLAMA_MODEL || null;
}

function getAllowedModels() {
  const configured = process.env.KESTREL_OLLAMA_ALLOWED_MODELS || process.env.KESTREL_OLLAMA_MODEL || '';
  return configured
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}

function isOllamaEnabled() {
  return process.env.KESTREL_OLLAMA_ENABLED === 'true';
}

async function appendAudit(req, event) {
  const record = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    actor: getActor(req),
    source: 'ai-broker',
    ...event,
  };
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.appendFile(AUDIT_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
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

async function completeWithOllama({ model, prompt, system, temperature, timeoutMs }) {
  const baseUrl = getOllamaBaseUrl();
  const response = await fetchWithTimeout(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      system: system || undefined,
      stream: false,
      options: {
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
      },
    }),
  }, timeoutMs);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Ollama completion failed with HTTP ${response.status}`);
  }

  return {
    text: payload?.response || '',
    raw: {
      model: payload?.model || model,
      created_at: payload?.created_at || null,
      done: payload?.done ?? null,
      total_duration: payload?.total_duration ?? null,
      eval_count: payload?.eval_count ?? null,
      eval_duration: payload?.eval_duration ?? null,
    },
  };
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
        enabled: isOllamaEnabled(),
        defaultModel: getDefaultModel(),
        allowedModels: getAllowedModels(),
        serverSideOnly: true,
        brokerReady: isOllamaEnabled() && Boolean(getDefaultModel()),
      },
    ],
  });
});

router.get('/broker/status', async (req, res) => {
  res.json({
    ok: true,
    enabled: process.env.KESTREL_AI_BROKER_ENABLED === 'true',
    providers: ['local-ollama'],
    defaultProvider: 'local-ollama',
    audit: 'prompt-hash-only',
    maxPromptChars: 8000,
  });
});

router.post('/broker/complete', async (req, res) => {
  const startedAt = Date.now();
  const enabled = process.env.KESTREL_AI_BROKER_ENABLED === 'true';
  const provider = sanitizeText(req.body?.provider, 48) || 'local-ollama';
  const prompt = sanitizeText(req.body?.prompt, 8000);
  const system = sanitizeText(req.body?.system, 2000);
  const requestedModel = sanitizeText(req.body?.model, 128);
  const timeoutMs = Math.max(1000, Math.min(60000, Number(req.body?.timeoutMs) || 20000));
  const temperature = Number(req.body?.temperature);
  const promptHash = hashText(prompt);

  if (!enabled) {
    await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'blocked-disabled',
      provider,
      promptHash,
      promptLength: prompt.length,
    });
    return res.status(403).json({ ok: false, error: 'AI broker is disabled. Set KESTREL_AI_BROKER_ENABLED=true on the Kestrel server.' });
  }

  if (provider !== 'local-ollama') {
    await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'blocked-provider',
      provider,
      promptHash,
      promptLength: prompt.length,
    });
    return res.status(400).json({ ok: false, error: 'Only local-ollama provider is implemented in AI Broker v0.' });
  }

  if (!isOllamaEnabled()) {
    await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'blocked-provider-disabled',
      provider,
      promptHash,
      promptLength: prompt.length,
    });
    return res.status(403).json({ ok: false, error: 'Local Ollama provider is disabled. Set KESTREL_OLLAMA_ENABLED=true.' });
  }

  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Missing prompt.' });
  }

  const allowedModels = getAllowedModels();
  const model = requestedModel || getDefaultModel();
  if (!model) {
    return res.status(400).json({ ok: false, error: 'No model configured. Set KESTREL_OLLAMA_MODEL.' });
  }

  if (allowedModels.length > 0 && !allowedModels.includes(model)) {
    await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'blocked-model',
      provider,
      model,
      promptHash,
      promptLength: prompt.length,
    });
    return res.status(403).json({ ok: false, error: 'Requested model is not in the server allowlist.' });
  }

  try {
    const completion = await completeWithOllama({ model, prompt, system, temperature, timeoutMs });
    const audit = await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'allowed',
      provider,
      model,
      promptHash,
      promptLength: prompt.length,
      responseLength: completion.text.length,
      elapsedMs: Date.now() - startedAt,
    });

    return res.json({
      ok: true,
      provider,
      model,
      text: completion.text,
      usage: completion.raw,
      auditId: audit.id,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    await appendAudit(req, {
      type: 'ai.broker.complete',
      capability: 'ai:chat.invoke',
      outcome: 'error',
      provider,
      model,
      promptHash,
      promptLength: prompt.length,
      error: error?.message ?? 'AI broker failed.',
      elapsedMs: Date.now() - startedAt,
    });
    return res.status(502).json({ ok: false, error: error?.message ?? 'AI broker failed.', elapsedMs: Date.now() - startedAt });
  }
});

router.get('/ollama/status', async (req, res) => {
  const baseUrl = getOllamaBaseUrl();
  const enabled = isOllamaEnabled();
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
  const enabled = isOllamaEnabled();
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
      defaultModel: getDefaultModel(),
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
