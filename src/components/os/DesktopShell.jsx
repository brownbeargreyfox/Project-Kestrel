import React from 'react';
import WindowManager from './WindowManager.jsx';
import Taskbar from './Taskbar.jsx';
import AppLauncher from './AppLauncher.jsx';
import ContextMenu from './ContextMenu.jsx';
import useGlobalShortcuts from '../../hooks/useGlobalShortcuts';
import useBreachToasts from '../../hooks/useBreachToasts.jsx';
import { useUIStore } from '../../store/useUIStore.ts';
import { PluginProvider } from './PluginProvider';

export default function DesktopShell() {
  useBreachToasts();
  useGlobalShortcuts();

  const [ctx, setCtx] = React.useState(null);
  const launchApp = useUIStore((s) => s.launchApp);
  const openLauncher = useUIStore((s) => s.openLauncher);

  const onDesktopContext = (e) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open Terminal', action: () => launchApp('kestrel-terminal') },
        { label: 'System Monitor', action: () => launchApp('system-health') },
        { label: 'Files',         action: () => launchApp('kestrel-files') },
        { separator: true },
        { label: 'Settings', action: () => {} },
      ],
    });
  };

  return (
    <PluginProvider enabledByDefault={import.meta.env.VITE_PLUGINS_ENABLED === 'true'}>
      <div className="relative w-screen h-screen bg-neutral-900 text-neutral-100 overflow-hidden">
        {/* Top bar */}
        <header className="relative z-[1000] h-14 border-b border-neutral-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="font-semibold tracking-wide">Kestrel</div>
            <span className="text-xs opacity-60">Desktop</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openLauncher}
              className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
              title="Open launcher (Ctrl+Space)"
            >
              ☰
            </button>
          </div>
        </header>

        {/* Desktop / windows layer (beneath header) */}
        {/* Desktop / windows layer (between header and taskbar) */}
 		<div
    	   className="absolute left-0 right-0 top-12 bottom-0 z-[200]"
		   onContextMenu={onDesktopContext}
		>
          <WindowManager />
        </div>

        {/* Overlays */}
        <AppLauncher />  {/* z-[1100] set inside component */}
        <Taskbar />      {/* z-[900]   set inside component */}

        {/* Context menu */}
        {ctx && <ContextMenu {...ctx} onClose={() => setCtx(null)} />}
      </div>
    </PluginProvider>
  );
}
