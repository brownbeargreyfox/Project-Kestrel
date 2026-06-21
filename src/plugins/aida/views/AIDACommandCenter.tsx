// src/plugins/aida/views/AIDACommandCenter.tsx
//
// AIDA command center — three-card overview for assets, events, and simulation.
// Connects to the AIDA WS stream and reads state from useAIDAStore.
// Governance: AIDA is advisory only. No autonomous action taken here.

import React from 'react';
import { useAIDAStore } from '../store/useAIDAStore';
import { useAIDAStream } from '../hooks/useAIDAStream';
import type {
  AIDAConnectionState,
  AIDAAsset,
  AIDAEvent,
  SimulationResult,
} from '../../../Types/aida';

// ── connection badge ──────────────────────────────────────────────────────────

interface BadgeCfg { label: string; dot: string; text: string }

const BADGE_CFG: Record<AIDAConnectionState, BadgeCfg> = {
  idle:         { label: 'Idle',         dot: '#6b7280', text: '#9ca3af' },
  connecting:   { label: 'Connecting…',  dot: '#f59e0b', text: '#fbbf24' },
  connected:    { label: 'Connected',    dot: '#10b981', text: '#34d399' },
  disconnected: { label: 'Disconnected', dot: '#f97316', text: '#fb923c' },
  error:        { label: 'Error',        dot: '#ef4444', text: '#f87171' },
};

function ConnectionBadge({ state }: { state: AIDAConnectionState }) {
  const cfg = BADGE_CFG[state];
  return (
    <span
      data-testid="connection-badge"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: cfg.text }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: cfg.dot,
          display: 'inline-block',
        }}
      />
      {cfg.label}
    </span>
  );
}

// ── assets card ───────────────────────────────────────────────────────────────

function riskColor(risk: number): string {
  if (risk >= 0.7) return '#ef4444';
  if (risk >= 0.4) return '#f59e0b';
  return '#22c55e';
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function AssetsCard({ assets }: { assets: AIDAAsset[] }) {
  return (
    <section
      data-testid="assets-card"
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <header style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 10, letterSpacing: '0.06em' }}>
        ASSETS <span style={{ color: '#64748b', fontWeight: 400 }}>({assets.length})</span>
      </header>

      {assets.length === 0 ? (
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
          No assets received. Connect the WS stream to populate.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {assets.slice(0, 8).map((a) => (
            <li key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                {a.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#64748b' }}>{a.type}</span>
                <span style={{ color: riskColor(a.risk), fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(a.risk * 100)}%
                </span>
                <span style={{ color: '#64748b' }}>{statusLabel(a.status)}</span>
              </span>
            </li>
          ))}
          {assets.length > 8 && (
            <li style={{ fontSize: 11, color: '#475569' }}>+{assets.length - 8} more</li>
          )}
        </ul>
      )}
    </section>
  );
}

// ── events card ───────────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventsCard({ events }: { events: AIDAEvent[] }) {
  return (
    <section
      data-testid="events-card"
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <header style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 10, letterSpacing: '0.06em' }}>
        RECENT EVENTS <span style={{ color: '#64748b', fontWeight: 400 }}>({events.length})</span>
      </header>

      {events.length === 0 ? (
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>No events received yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {events.slice(0, 6).map((e) => (
            <li key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
              <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatTs(e.ts)}
              </span>
              <span style={{ color: '#94a3b8', flexShrink: 0 }}>{e.source}</span>
              <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── simulation card ───────────────────────────────────────────────────────────

function DeltaBadge({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: positive ? '#34d399' : '#f87171',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {positive ? '+' : ''}{Math.round(value * 100)}{suffix}
    </span>
  );
}

function SimulationCard({ sim }: { sim: SimulationResult | null }) {
  return (
    <section
      data-testid="simulation-card"
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <header style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 10, letterSpacing: '0.06em' }}>
        LATEST SIMULATION
      </header>

      {sim === null ? (
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>
          No simulation results yet. Run a simulation to see projected outcomes.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            <span style={{ color: '#64748b' }}>Asset:</span>{' '}
            <span style={{ color: '#cbd5e1' }}>{sim.assetId}</span>
            <span style={{ color: '#64748b', marginLeft: 12 }}>Scenario:</span>{' '}
            <span style={{ color: '#cbd5e1' }}>{sim.scenario}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>RISK REDUCTION</div>
              <DeltaBadge value={sim.delta.riskReduction} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>HEALTH GAIN</div>
              <DeltaBadge value={sim.delta.healthImprovement} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>CASCADE REDUCTION</div>
              <DeltaBadge value={sim.delta.cascadeRiskReduction} />
            </div>
          </div>

          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
            Run at {new Date(sim.ts).toLocaleString()}
          </div>
        </div>
      )}
    </section>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export const AIDACommandCenter: React.FC = () => {
  useAIDAStream();

  const connectionState = useAIDAStore((s) => s.connectionState);
  const serverTime      = useAIDAStore((s) => s.serverTime);
  const lastError       = useAIDAStore((s) => s.lastError);
  const assets          = useAIDAStore((s) => Object.values(s.assets));
  const events          = useAIDAStore((s) => s.events);
  const lastSim         = useAIDAStore((s) => s.lastSim);

  return (
    <div
      data-testid="aida-command-center"
      style={{
        background: '#0f172a',
        color: '#f1f5f9',
        padding: 20,
        borderRadius: 10,
        fontFamily: 'ui-monospace, monospace',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 400,
      }}
    >
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0', letterSpacing: '0.03em' }}>
          AIDA Command Center
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {serverTime !== null && (
            <span style={{ fontSize: 11, color: '#475569' }}>
              Server: {new Date(serverTime).toLocaleTimeString()}
            </span>
          )}
          <ConnectionBadge state={connectionState} />
        </div>
      </header>

      {/* error bar */}
      {lastError !== null && (
        <div
          role="alert"
          style={{ fontSize: 12, color: '#fca5a5', background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '6px 10px' }}
        >
          {lastError}
        </div>
      )}

      {/* cards */}
      <AssetsCard assets={assets} />
      <EventsCard events={events} />
      <SimulationCard sim={lastSim} />

      {/* governance footer */}
      <footer style={{ fontSize: 10, color: '#334155', borderTop: '1px solid #1e293b', paddingTop: 8, textAlign: 'center' }}>
        Advisory only · Human-in-the-loop · No autonomous action
      </footer>
    </div>
  );
};

export default AIDACommandCenter;
