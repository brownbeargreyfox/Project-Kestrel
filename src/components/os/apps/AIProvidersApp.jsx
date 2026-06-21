// src/components/os/apps/AIProvidersApp.jsx

import React from 'react';
import { Bot, CheckCircle2, RefreshCw, Server, TriangleAlert, XCircle } from 'lucide-react';

function StatusPill({ enabled, reachable }) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
        <XCircle size={14} /> Disabled
      </span>
    );
  }

  if (reachable) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950 px-2 py-1 text-xs text-emerald-200">
        <CheckCircle2 size={14} /> Reachable
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-800 bg-red-950 px-2 py-1 text-xs text-red-200">
      <TriangleAlert size={14} /> Unreachable
    </span>
  );
}

export default function AIProvidersApp() {
  const [providers, setProviders] = React.useState([]);
  const [status, setStatus] = React.useState(null);
  const [models, setModels] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const loadProviderState = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [providerResponse, statusResponse] = await Promise.all([
        fetch('/api/ai/providers'),
        fetch('/api/ai/ollama/status'),
      ]);

      const providerPayload = await providerResponse.json();
      const statusPayload = await statusResponse.json();

      if (!providerResponse.ok || !providerPayload.ok) {
        throw new Error(providerPayload.error || `Provider load failed with HTTP ${providerResponse.status}`);
      }

      setProviders(providerPayload.providers ?? []);
      setStatus(statusPayload);

      if (statusPayload.enabled && statusPayload.reachable) {
        const modelsResponse = await fetch('/api/ai/ollama/models');
        const modelsPayload = await modelsResponse.json();
        if (!modelsResponse.ok || !modelsPayload.ok) {
          throw new Error(modelsPayload.error || `Model load failed with HTTP ${modelsResponse.status}`);
        }
        setModels(modelsPayload.models ?? []);
      } else {
        setModels([]);
      }
    } catch (err) {
      setError(err?.message ?? 'Failed to load AI provider state');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadProviderState();
  }, [loadProviderState]);

  const ollamaProvider = providers.find((provider) => provider.id === 'local-ollama');

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="ai-providers-app">
      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="text-purple-300" size={20} />
              <h2 className="text-lg font-semibold">AI Providers</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              Server-side AI provider wiring for Kestrel apps. Local Ollama stays behind the API boundary.
            </p>
          </div>
          <button
            type="button"
            onClick={loadProviderState}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
            data-testid="ai-provider-refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200" data-testid="ai-provider-error">
          {error}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid="local-ollama-provider">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Server size={18} />
                <h3 className="font-semibold">Local Ollama</h3>
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                Configured from the Kestrel server process. This app only checks provider status through `/api/ai`.
              </p>
            </div>
            <StatusPill enabled={status?.enabled} reachable={status?.reachable} />
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Base URL</dt>
              <dd className="mt-1 break-all font-mono text-sm">{status?.baseUrl || ollamaProvider?.baseUrl || 'unknown'}</dd>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Version</dt>
              <dd className="mt-1 text-sm">{status?.version || 'not available'}</dd>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Default Model</dt>
              <dd className="mt-1 text-sm">{ollamaProvider?.defaultModel || 'not set'}</dd>
            </div>
          </dl>

          {status?.message && (
            <div className="mt-4 rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-100">
              {status.message}
            </div>
          )}

          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">Available models</h4>
              <span className="text-xs text-neutral-500">{models.length} loaded</span>
            </div>

            {models.length === 0 ? (
              <div className="mt-3 text-sm text-neutral-400">
                No models returned. Enable Ollama and pull a model on the server, then refresh.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                {models.map((model) => (
                  <div key={model.name} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                    <div className="font-mono text-sm text-neutral-100">{model.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {model.details?.family || 'unknown family'} · {model.details?.parameter_size || 'unknown size'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
            Server env:
            <pre className="mt-2 overflow-auto rounded bg-neutral-900 p-3 text-xs text-neutral-300">{`KESTREL_OLLAMA_ENABLED=true
KESTREL_OLLAMA_BASE_URL=http://127.0.0.1:11434
KESTREL_OLLAMA_MODEL=llama3.2`}</pre>
          </div>
        </section>
      </main>
    </div>
  );
}
