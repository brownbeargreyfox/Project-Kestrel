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
  const recoverWindows = useUIStore((s) => s.recoverWindows);

  const onDesktopContext = (e) => {
    e.preventDefault();
    setCtx({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Arrange Windows', action: recoverWindows },
        { label: 'Open Launcher', action: openLauncher },
        { separator: true },
        { label: 'Open Terminal', action: () => launchApp('kestrel-terminal') },
        { label: 'System Monitor', action: () => launchApp('system-health') },
        { label: 'Files', action: () => launchApp('kestrel-files') },
      ],
    });
  };

  return (
    <PluginProvider enabledByDefault={import.meta.env.VITE_PLUGINS_ENABLED === 'true'}>
      <div className="relative w-screen h-screen bg-neutral-900 text-neutral-100 overflow-hidden">
        <Taskbar />

        <div
          className="absolute left-0 right-0 top-12 bottom-0 z-[200]"
          onContextMenu={onDesktopContext}
        >
          <WindowManager />
        </div>

        <AppLauncher />

        {ctx && <ContextMenu {...ctx} onClose={() => setCtx(null)} />}
      </div>
    </PluginProvider>
  );
}
