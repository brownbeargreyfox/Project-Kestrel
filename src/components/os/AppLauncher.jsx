// src/components/os/AppLauncher.jsx
import React, { useEffect, useState } from 'react';
import { AppRegistry } from './apps/AppRegistry';
import { useUIStore } from '../../store/useUIStore.ts';

export default function AppLauncher() {
  const { launcherOpen, launchApp, closeLauncher } = useUIStore(s => s);
  const [panelIn, setPanelIn] = useState(false); // slide-in state

  useEffect(() => {
    if (!launcherOpen) return;
    setPanelIn(false); // start off-screen
    const id = requestAnimationFrame(() => setPanelIn(true)); // slide in next frame
    const onKey = (e) => { if (e.key === 'Escape') beginClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey); };
  }, [launcherOpen]);

  if (!launcherOpen) return null;

  const beginClose = () => {
    setPanelIn(false);
    setTimeout(() => closeLauncher(), 220); // match transition duration
  };

  const apps = Object.values(AppRegistry || {});

  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/40"
      onClick={beginClose}
      data-testid="app-launcher-overlay"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-launcher-title"
        data-testid="app-launcher-panel"
        onClick={(e) => e.stopPropagation()}
        className={`fixed top-16 right-3 bottom-12 w-[520px]
                    rounded-xl border border-neutral-700 bg-neutral-850/95 backdrop-blur
                    p-3 shadow-xl overflow-auto
                    transform-gpu transition-transform duration-200 ease-out motion-reduce:transition-none
                    ${panelIn ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id="app-launcher-title" className="text-sm font-semibold opacity-90">Apps</h3>
          <button
            onClick={beginClose}
            className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
            title="Close"
            aria-label="Close app launcher"
            data-testid="app-launcher-close"
          >
            Close
          </button>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-3" data-testid="app-launcher-grid">
          {apps.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={async () => { beginClose(); await launchApp(m.id); }}
                className="p-3 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-left border border-neutral-700"
                aria-label={`Launch ${m.title}`}
                data-testid={`app-launcher-app-${m.id}`}
              >
                <div className="flex items-center gap-2">
                  {Icon ? <Icon size={16} /> : null}
                  <div className="font-medium">{m.title}</div>
                </div>
                <div className="text-xs opacity-60 mt-1">{m.id}</div>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}