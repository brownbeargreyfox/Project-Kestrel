import { Router } from 'express';

const router = Router();

function enabled(name) {
  return process.env[name] === 'true';
}

function listFromEnv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function masked(name) {
  return Boolean(process.env[name]);
}

function getCatalog() {
  return [
    {
      id: 'local-ollama',
      title: 'Local Ollama',
      kind: 'local-runtime',
      enabled: enabled('KESTREL_OLLAMA_ENABLED'),
      baseUrl: process.env.KESTREL_OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      defaultModel: process.env.KESTREL_OLLAMA_MODEL || null,
      allowedModels: listFromEnv('KESTREL_OLLAMA_ALLOWED_MODELS', listFromEnv('KESTREL_OLLAMA_MODEL')),
      secretsConfigured: false,
      serverSideOnly: true,
    },
    {
      id: 'openai',
      title: 'OpenAI',
      kind: 'external-api',
      enabled: enabled('KESTREL_OPENAI_ENABLED'),
      defaultModel: process.env.KESTREL_OPENAI_MODEL || null,
      allowedModels: listFromEnv('KESTREL_OPENAI_ALLOWED_MODELS'),
      secretsConfigured: masked('KESTREL_OPENAI_API_KEY'),
      serverSideOnly: true,
    },
    {
      id: 'anthropic',
      title: 'Claude / Anthropic',
      kind: 'external-api',
      enabled: enabled('KESTREL_ANTHROPIC_ENABLED'),
      defaultModel: process.env.KESTREL_ANTHROPIC_MODEL || null,
      allowedModels: listFromEnv('KESTREL_ANTHROPIC_ALLOWED_MODELS'),
      secretsConfigured: masked('KESTREL_ANTHROPIC_API_KEY'),
      serverSideOnly: true,
    },
    {
      id: 'gemini',
      title: 'Google Gemini',
      kind: 'external-api',
      enabled: enabled('KESTREL_GEMINI_ENABLED'),
      defaultModel: process.env.KESTREL_GEMINI_MODEL || null,
      allowedModels: listFromEnv('KESTREL_GEMINI_ALLOWED_MODELS'),
      secretsConfigured: masked('KESTREL_GEMINI_API_KEY'),
      serverSideOnly: true,
    },
    {
      id: 'microsoft-copilot',
      title: 'Microsoft Copilot',
      kind: 'enterprise-context',
      enabled: enabled('KESTREL_COPILOT_ENABLED'),
      defaultModel: process.env.KESTREL_COPILOT_MODE || 'enterprise-context',
      allowedModels: listFromEnv('KESTREL_COPILOT_ALLOWED_MODES', ['enterprise-context']),
      secretsConfigured: masked('KESTREL_COPILOT_CLIENT_ID'),
      serverSideOnly: true,
    },
  ];
}

router.get('/models', (req, res) => {
  const providers = getCatalog();
  res.json({
    ok: true,
    defaultProvider: process.env.KESTREL_DEFAULT_MODEL_PROVIDER || 'local-ollama',
    providers,
    enabledCount: providers.filter((provider) => provider.enabled).length,
    notes: [
      'Secrets are reported only as configured/not configured.',
      'External providers are registry entries only in this slice.',
      'Model calls still route through the AI broker.',
    ],
  });
});

export default router;
