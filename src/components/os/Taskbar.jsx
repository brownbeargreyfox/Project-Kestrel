// src/components/os/Taskbar.jsx
import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../store/useUIStore.ts';

export default function Taskbar() {
  const {
    osWindows,
    osFocusedId,
    focusWindow,
    activeWorkspace,
    openLauncher,
    recoverWindows,
    minimizeWindow,
    closeWindow,
  } = useUIStore(s => s);

  const windows = osWindows
    .filter(w => w.workspace === activeWorkspace)
    .sort((a, b) => a.z - b.z);

  const focused = windows.find(w => w.id === osFocusedId);

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed top-0 inset-x-0 z-[1000] h-12 border-b border-neutral-700 bg-neutral-900/95 backdrop-blur flex items-center gap-2 px-3">
      <button
        type="button"
        onClick={openLauncher}
        className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 border border-sky-500 text-sm font-semibold"
        title="Open launcher (Ctrl+Space)"
        data-testid="top-panel-launcher"
      >
        Kestrel
      </button>

      <button
        type="button"
        onClick={recoverWindows}
        className="px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs"
        title="Arrange windows (Ctrl+Alt+R)"
        data-testid="top-panel-arrange"
      >
        Arrange
      </button>

      <div className="h-6 w-px bg-neutral-700" />

      <div className="min-w-0 flex-1 flex items-center gap-2 overflow-x-auto">
        {windows.length === 0 ? (
          <span className="text-sm text-neutral-500">No open apps</span>
        ) : (
          windows.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => focusWindow(w.id)}
              onAuxClick={(e) => { if (e.button === 1) closeWindow(w.id); }}
              title={`${w.title}${w.minimized ? ' (minimized)' : ''}`}
              className={`px-3 py-1.5 rounded-lg border truncate max-w-[15rem] text-sm ${
                w.id === osFocusedId
                  ? 'bg-sky-700 border-sky-500 text-white'
                  : w.minimized
                    ? 'bg-neutral-950 border-neutral-700 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-100 hover:bg-neutral-700'
              }`}
              data-testid={`top-panel-window-${w.id}`}
            >
              {w.title}
            </button>
          ))
        )}
      </div>

      {focused && (
        <div className="hidden md:flex items-center gap-1 border-l border-neutral-700 pl-2">
          <span className="max-w-[14rem] truncate text-xs text-neutral-400" title={focused.title}>
            {focused.title}
          </span>
          <button
            type="button"
            onClick={() => minimizeWindow(focused.id)}
            className="px-2 py-1 rounded hover:bg-neutral-800 text-sm"
            title="Minimize focused window"
          >
            —
          </button>
          <button
            type="button"
            onClick={() => closeWindow(focused.id)}
            className="px-2 py-1 rounded hover:bg-red-950 text-red-300 text-sm"
            title="Close focused window"
          >
            ×
          </button>
        </div>
      )}

      <div className="text-xs text-neutral-400 tabular-nums whitespace-nowrap">
        {clock.toLocaleTimeString()}
      </div>
    </div>
  );
}