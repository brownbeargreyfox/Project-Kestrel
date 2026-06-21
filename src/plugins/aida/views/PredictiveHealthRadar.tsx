// src/plugins/aida/views/PredictiveHealthRadar.tsx
//
// Polar risk radar — plots risks by time-to-impact (radius) and type (sector).
// Closer to center = more urgent. Color = severity. Size = blast radius.
//
// Feature flags respected (all via VITE_* env):
//   VITE_FF_AIDA_RADAR           = 'true'  — required to render (default: disabled)
//   VITE_FF_SHOW_CALIBRATION     = 'true'  — show probability/confidence numbers
//   VITE_FF_WORKFLOW_ACTIONS     = 'true'  — show Ack / Suppress / Assign buttons
//   VITE_FF_CANVAS_LAYER         = 'true'  — use CanvasPointLayer instead of SVG circles

import React, { useCallback, useMemo, useRef } from 'react';
import { useAIDAStore } from '../store/useAIDAStore';
import { CanvasPointLayer } from './CanvasPointLayer';
import type { CanvasPoint } from './CanvasPointLayer';
import type { Risk, RiskType, RiskAction } from '../../../Types/aida';

// ── feature flags ─────────────────────────────────────────────────────────────

const FF_RADAR              = import.meta.env['VITE_FF_AIDA_RADAR']         === 'true';
const FF_SHOW_CALIBRATION   = import.meta.env['VITE_FF_SHOW_CALIBRATION']   === 'true';
const FF_WORKFLOW_ACTIONS   = import.meta.env['VITE_FF_WORKFLOW_ACTIONS']   === 'true';
const FF_CANVAS             = import.meta.env['VITE_FF_CANVAS_LAYER']       === 'true';

// ── constants ─────────────────────────────────────────────────────────────────

const SVG_SIZE     = 360;
const CENTER       = SVG_SIZE / 2;
const OUTER_RADIUS = 140;
const LOG_MAX      = Math.log(49); // 48h + 1 for log scale

const TYPE_ORDER: RiskType[] = ['cascade', 'anomaly', 'prediction', 'slo'];

const TYPE_LABELS: Record<RiskType, string> = {
  cascade:    'CASCADE',
  anomaly:    'ANOMALY',
  prediction: 'PREDICTION',
  slo:        'SLO',
};

const SEVERITY_COLOR: Record<Risk['severity'], string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#22c55e',
};

// ── mock data ─────────────────────────────────────────────────────────────────
// Used when the store has no live risks (WS not connected or no risk events).

const MOCK_RISKS: Risk[] = [
  {
    id: 'mock-cascade-1',
    type: 'cascade',
    severity: 'high',
    probability: 0.78,
    confidence: 0.84,
    timeToImpact: 2.5,
    eta: { p10: 1.2, p50: 2.5, p90: 5.0 },
    title: 'Database tier cascade risk',
    description: 'Elevated load on primary database may cascade to application tier.',
    affected: ['db-primary-01', 'app-server-02', 'app-server-03'],
    blastRadius: 7,
    mitigation: 'Promote read replica to primary. Distribute read load across replicas.',
    model: 'cascade-v1.0',
    explain: 'High CPU saturation on db-primary-01 (94%) combined with query storm from app tier.',
    state: 'active',
    suppressions: [],
    createdAt: new Date(Date.now() - 900_000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-anomaly-1',
    type: 'anomaly',
    severity: 'medium',
    probability: 0.61,
    confidence: 0.72,
    timeToImpact: 8.5,
    eta: { p10: 5, p50: 8.5, p90: 14 },
    title: 'Memory leak — web-02',
    description: 'Memory growth rate deviates from baseline by 3.2σ.',
    affected: ['web-server-02'],
    blastRadius: 2,
    mitigation: 'Schedule graceful restart during the next low-traffic window.',
    model: 'anomaly-v1.0',
    explain: 'Memory has grown 4% per hour for the past 6 hours, above the 2σ threshold.',
    state: 'active',
    suppressions: [],
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-prediction-1',
    type: 'prediction',
    severity: 'medium',
    probability: 0.52,
    confidence: 0.65,
    timeToImpact: 18,
    eta: { p10: 12, p50: 18, p90: 30 },
    title: 'Disk saturation — nas-01',
    description: 'At current write velocity, NAS primary volume reaches 95% within 18 hours.',
    affected: ['nas-01'],
    blastRadius: 4,
    mitigation: 'Trigger archival sweep. Move cold data to secondary storage.',
    model: 'prediction-v1.0',
    explain: 'Write rate 8.2 GB/h; 142 GB free; projected saturation in ~17.3h.',
    state: 'active',
    suppressions: [],
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock-slo-1',
    type: 'slo',
    severity: 'low',
    probability: 0.34,
    confidence: 0.58,
    timeToImpact: 36,
    eta: { p10: 24, p50: 36, p90: 56 },
    title: 'Latency SLO at risk — api-gw',
    description: 'P99 latency trending toward 200ms SLO boundary.',
    affected: ['api-gateway-01'],
    blastRadius: 5,
    mitigation: 'Review connection pool settings. Consider rate-limiting upstream services.',
    model: 'slo-v1.0',
    explain: 'P99 at 185ms (SLO: 200ms). Upward trend at +1.2ms/hour.',
    state: 'active',
    suppressions: [],
    createdAt: new Date(Date.now() - 14_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ── geometry helpers ──────────────────────────────────────────────────────────

function ttiToRadius(tti: number): number {
  // Log scale: 48h maps to outer edge, 0h maps to center
  // log(tti+1) / log(49) gives 0..1 range
  return OUTER_RADIUS * Math.min(1, Math.log(tti + 1) / LOG_MAX);
}

function dotRadius(blastRadius: number): number {
  return 5 + blastRadius * 0.65;
}

interface RadarDot {
  risk:  Risk;
  x:     number;
  y:     number;
  r:     number;
  color: string;
}

function computeDots(risks: Risk[]): RadarDot[] {
  const byType: Record<RiskType, Risk[]> = {
    cascade: [], anomaly: [], prediction: [], slo: [],
  };
  for (const risk of risks) {
    byType[risk.type].push(risk);
  }

  const dots: RadarDot[] = [];

  for (let si = 0; si < TYPE_ORDER.length; si++) {
    const type = TYPE_ORDER[si];
    if (type === undefined) continue;
    const group = byType[type];
    // Sector spans π/2. Start from top (-π/2) and rotate clockwise per sector.
    const sectorStart = si * (Math.PI / 2) - Math.PI / 2;

    for (let ri = 0; ri < group.length; ri++) {
      const risk = group[ri];
      if (risk === undefined) continue;
      const angle = sectorStart + ((ri + 0.5) / Math.max(group.length, 1)) * (Math.PI / 2);
      const r     = ttiToRadius(risk.timeToImpact);
      dots.push({
        risk,
        x:     CENTER + r * Math.cos(angle),
        y:     CENTER + r * Math.sin(angle),
        r:     dotRadius(risk.blastRadius),
        color: SEVERITY_COLOR[risk.severity],
      });
    }
  }

  return dots;
}

// ── workflow actions ──────────────────────────────────────────────────────────

async function postRiskAction(action: RiskAction): Promise<void> {
  await fetch(`/api/risks/${action.riskId}/actions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(action),
  });
}

// ── detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ risk, onClose }: { risk: Risk; onClose: () => void }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  async function handleAction(type: RiskAction['type']) {
    setBusy(type);
    try {
      await postRiskAction({ type, riskId: risk.id });
      setNotice(`${type} sent`);
    } catch {
      setNotice('Action failed — check server connection');
    } finally {
      setBusy(null);
    }
  }

  const severityColor = SEVERITY_COLOR[risk.severity];

  return (
    <aside
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <span style={{ color: severityColor, fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>
            {risk.severity}
          </span>
          <span style={{ color: '#64748b', marginLeft: 8, fontSize: 10 }}>
            {risk.type}
          </span>
          <h3 style={{ margin: '4px 0 0', fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>
            {risk.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <p style={{ margin: 0, color: '#94a3b8' }}>{risk.description}</p>

      <div style={{ color: '#64748b' }}>
        <strong style={{ color: '#94a3b8' }}>Model explains: </strong>{risk.explain}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span style={{ color: '#64748b' }}>Blast radius: </span>
          <span style={{ color: '#cbd5e1' }}>{risk.blastRadius} assets</span>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Affected: </span>
          <span style={{ color: '#cbd5e1' }}>{risk.affected.join(', ')}</span>
        </div>
      </div>

      {FF_SHOW_CALIBRATION && (
        <div style={{ display: 'flex', gap: 16, color: '#64748b', borderTop: '1px solid #334155', paddingTop: 6 }}>
          <div>
            Probability: <span style={{ color: '#cbd5e1' }}>{(risk.probability * 100).toFixed(0)}%</span>
          </div>
          <div>
            Confidence: <span style={{ color: '#cbd5e1' }}>{(risk.confidence * 100).toFixed(0)}%</span>
          </div>
          <div>
            ETA p50: <span style={{ color: '#cbd5e1' }}>{risk.eta.p50}h</span>
            <span style={{ color: '#475569' }}> (p10: {risk.eta.p10}h – p90: {risk.eta.p90}h)</span>
          </div>
        </div>
      )}

      <div style={{ color: '#94a3b8' }}>
        <strong>Mitigation: </strong>{risk.mitigation}
      </div>

      {FF_WORKFLOW_ACTIONS && (
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #334155', paddingTop: 8 }}>
          {(['ack', 'suppress', 'assign'] as const).map((type) => (
            <button
              key={type}
              disabled={busy !== null}
              onClick={() => void handleAction(type)}
              style={{
                background: busy === type ? '#1e3a5f' : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: busy !== null ? '#475569' : '#94a3b8',
                cursor: busy !== null ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                textTransform: 'capitalize',
              }}
            >
              {busy === type ? '…' : type}
            </button>
          ))}
          {notice !== null && (
            <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>{notice}</span>
          )}
        </div>
      )}
    </aside>
  );
}

// ── ring/sector labels ────────────────────────────────────────────────────────

function RadarBackground({ reducedMotion }: { reducedMotion: boolean }) {
  const rings  = [6, 12, 24, 48];
  const labels = ['6h', '12h', '24h', '48h+'];

  return (
    <g>
      {/* sector dividers */}
      {[0, 1, 2, 3].map((i) => {
        const angle = i * (Math.PI / 2) - Math.PI / 2;
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + OUTER_RADIUS * Math.cos(angle)}
            y2={CENTER + OUTER_RADIUS * Math.sin(angle)}
            stroke="#1e3a5f"
            strokeWidth={1}
          />
        );
      })}

      {/* concentric rings */}
      {rings.map((h, i) => {
        const r = ttiToRadius(h);
        return (
          <g key={h}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke="#1e3a5f"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={CENTER + r + 3}
              y={CENTER}
              fill="#334155"
              fontSize={9}
              dominantBaseline="middle"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}

      {/* outer boundary */}
      <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} fill="none" stroke="#1e3a5f" strokeWidth={1} />

      {/* sector labels */}
      {TYPE_ORDER.map((type, si) => {
        const midAngle = si * (Math.PI / 2) - Math.PI / 2 + Math.PI / 4;
        const labelR   = OUTER_RADIUS + 18;
        const lx       = CENTER + labelR * Math.cos(midAngle);
        const ly       = CENTER + labelR * Math.sin(midAngle);
        return (
          <text
            key={type}
            x={lx}
            y={ly}
            fill="#334155"
            fontSize={9}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="middle"
            letterSpacing="0.08em"
          >
            {TYPE_LABELS[type]}
          </text>
        );
      })}

      {/* center label */}
      <text x={CENTER} y={CENTER - OUTER_RADIUS - 6} fill="#1e3a5f" fontSize={9} textAnchor="middle">
        URGENT
      </text>
    </g>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export interface PredictiveHealthRadarProps {
  risks?: Risk[];
}

export const PredictiveHealthRadar: React.FC<PredictiveHealthRadarProps> = ({ risks: propRisks }) => {
  if (!FF_RADAR) {
    return (
      <div style={{ padding: 24, color: '#475569', fontSize: 12, textAlign: 'center' }}>
        Predictive Health Radar is disabled.
        Set <code>VITE_FF_AIDA_RADAR=true</code> to enable.
      </div>
    );
  }

  return <RadarView propRisks={propRisks} />;
};

// Separate inner component so hooks run unconditionally (FF_RADAR guard is above)
function RadarView({ propRisks }: { propRisks: Risk[] | undefined }) {
  const storeRisks     = useAIDAStore((s) => s.getRiskArray());
  const selectedRiskId = useAIDAStore((s) => s.selectedRiskId);
  const setSelectedRisk = useAIDAStore((s) => s.setSelectedRisk);
  const layout         = useAIDAStore((s) => s.layout);

  const risks: Risk[] = propRisks !== undefined
    ? propRisks
    : storeRisks.length > 0
      ? storeRisks
      : MOCK_RISKS;

  const isMock = propRisks === undefined && storeRisks.length === 0;

  const [kbIdx, setKbIdx] = React.useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const dots = useMemo(() => computeDots(risks), [risks]);

  const selectedRisk = useMemo(
    () => (selectedRiskId !== null ? risks.find((r) => r.id === selectedRiskId) ?? null : null),
    [risks, selectedRiskId],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (risks.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          setKbIdx((i) => (i + 1) % risks.length);
          break;

        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          setKbIdx((i) => (i - 1 + risks.length) % risks.length);
          break;

        case 'Enter': {
          e.preventDefault();
          const focused = risks[kbIdx];
          if (focused !== undefined) {
            setSelectedRisk(focused.id === selectedRiskId ? null : focused.id);
          }
          break;
        }

        case 'Escape':
          e.preventDefault();
          setSelectedRisk(null);
          break;

        default:
          break;
      }
    },
    [risks, kbIdx, selectedRiskId, setSelectedRisk],
  );

  // Canvas points (when ff_canvas_layer is enabled)
  const canvasPoints: CanvasPoint[] = useMemo(
    () =>
      dots.map((d) => ({
        id:     d.risk.id,
        x:      d.x,
        y:      d.y,
        radius: d.r,
        color:  d.color,
        label:  d.risk.title,
      })),
    [dots],
  );

  function handleSelect(id: string | null) {
    setSelectedRisk(id === selectedRiskId ? null : id);
  }

  const useCanvas = FF_CANVAS || layout.useCanvas;

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'ui-monospace, monospace',
        color: '#f1f5f9',
      }}
    >
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
          Predictive Health Radar
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isMock && (
            <span style={{ fontSize: 10, color: '#64748b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px' }}>
              MOCK
            </span>
          )}
          <span style={{ fontSize: 10, color: '#334155' }}>
            {risks.length} risk{risks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* radar area */}
      <div
        ref={containerRef}
        tabIndex={0}
        role="application"
        aria-label={`Risk radar. ${risks.length} risks displayed. Use arrow keys to navigate, Enter to select.`}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          outline: 'none',
          cursor: 'default',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ display: 'block', maxWidth: '100%' }}
          aria-hidden="true"
        >
          {/* background */}
          <rect width={SVG_SIZE} height={SVG_SIZE} fill="#0f172a" />
          <RadarBackground reducedMotion={prefersReduced} />

          {/* risk dots — SVG path (default) */}
          {!useCanvas && dots.map((d, i) => {
            const isSel = d.risk.id === selectedRiskId;
            const isKb  = i === kbIdx;
            const risk  = d.risk;

            return (
              <g key={risk.id}>
                {/* keyboard focus ring */}
                {isKb && (
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={d.r + 4}
                    fill="none"
                    stroke="#7dd3fc"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                )}
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={isSel ? d.r * 1.4 : d.r}
                  fill={d.color}
                  fillOpacity={isSel ? 1 : 0.75}
                  stroke={isSel ? '#fff' : 'none'}
                  strokeWidth={isSel ? 2 : 0}
                  style={prefersReduced
                    ? { cursor: 'pointer' }
                    : { cursor: 'pointer', transition: 'r 0.15s, fill-opacity 0.15s' }}
                  onClick={() => handleSelect(risk.id)}
                  role="button"
                  aria-label={`${risk.title} — ${risk.severity} severity`}
                  tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>

        {/* canvas overlay (ff_canvas_layer) */}
        {useCanvas && (
          <div style={{ position: 'absolute', top: 0, left: 0 }}>
            <CanvasPointLayer
              points={canvasPoints}
              width={SVG_SIZE}
              height={SVG_SIZE}
              selectedId={selectedRiskId}
              onSelect={handleSelect}
            />
          </div>
        )}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#475569' }}>
        <span>Center = urgent (&lt;2h)</span>
        <span>Outer = &gt;48h</span>
        {Object.entries(SEVERITY_COLOR).map(([sev, color]) => (
          <span key={sev} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {sev}
          </span>
        ))}
      </div>

      {/* keyboard hint */}
      <p style={{ fontSize: 10, color: '#334155', margin: 0 }}>
        Arrow keys to navigate · Enter to select · Esc to deselect
      </p>

      {/* detail panel */}
      {selectedRisk !== null && (
        <DetailPanel risk={selectedRisk} onClose={() => setSelectedRisk(null)} />
      )}
    </div>
  );
}

export default PredictiveHealthRadar;
