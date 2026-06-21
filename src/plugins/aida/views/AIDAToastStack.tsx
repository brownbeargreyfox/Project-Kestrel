// src/plugins/aida/views/AIDAToastStack.tsx
//
// Toast notifications for new AIDA risk recommendations.
// Renders in a fixed bottom-right stack; auto-dismisses after 5 s.
// Mount once in AIDACommandCenter (or any persistent AIDA container).

import React, { useEffect } from 'react';
import { useAIDAStore } from '../store/useAIDAStore';
import type { AIDAToast } from '../../../Types/aida';

const SEV_STYLE: Record<AIDAToast['severity'], { bg: string; border: string; dot: string }> = {
  high:   { bg: '#1c0a0a', border: '#7f1d1d', dot: '#ef4444' },
  medium: { bg: '#1a1207', border: '#78350f', dot: '#f59e0b' },
  low:    { bg: '#071a0d', border: '#14532d', dot: '#22c55e' },
};

function Toast({ toast }: { toast: AIDAToast }) {
  const dismiss = useAIDAStore((s) => s.dismissToast);
  const cfg = SEV_STYLE[toast.severity] ?? SEV_STYLE['medium'];

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);

  return (
    <div
      role="alert"
      onClick={() => dismiss(toast.id)}
      style={{
        background:   cfg.bg,
        border:       `1px solid ${cfg.border}`,
        borderRadius: 8,
        padding:      '10px 14px',
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        cursor:       'pointer',
        boxShadow:    '0 4px 16px rgba(0,0,0,0.6)',
        fontFamily:   'ui-monospace, monospace',
      }}
    >
      <span
        style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cfg.dot, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', marginBottom: 3 }}>
          NEW RISK
        </div>
        <div
          style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {toast.title}
        </div>
      </div>
      <button
        aria-label="Dismiss notification"
        onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

export function AIDAToastStack(): React.ReactElement | null {
  const toasts = useAIDAStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="AIDA risk notifications"
      style={{
        position:      'fixed',
        bottom:        24,
        right:         24,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        zIndex:        9000,
        width:         320,
        pointerEvents: 'auto',
      }}
    >
      {toasts.map((t) => <Toast key={t.id} toast={t} />)}
    </div>
  );
}
