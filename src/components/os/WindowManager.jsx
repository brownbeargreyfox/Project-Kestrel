// src/components/os/WindowManager.jsx
import React, { useEffect, useMemo } from 'react';
import Window from './Window.jsx';
import { useUIStore } from '../../store/useUIStore.ts';
import { AppErrorBoundary } from './AppErrorBoundary';

export default function WindowManager() {
  const { osWindows, osFocusedId, activeWorkspace } = useUIStore(s => s);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const S = useUIStore.getState();
      const focusedId = S.osFocusedId;

      // Launcher
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'Space') {
        e.preventDefault();
        S.openLauncher();
        return;
      }

      // Emergency window recovery / arrange visible workspace
      if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        S.recoverWindows();
        return;
      }

      // Alt+Tab / Shift+Alt+Tab – cycle focus
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        S.cycleFocus(e.shiftKey ? -1 : 1);
        return;
      }
      if (!focusedId) return;

      // Ctrl+W – close
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        S.closeWindow(focusedId);
        return;
      }
      // Ctrl+M – minimize
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        S.minimizeWindow(focusedId);
        return;
      }
      // Ctrl+Shift+ArrowUp – maximize/restore
      if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        S.toggleMaximize(focusedId);
        return;
      }
      // Ctrl+[ / Ctrl+] – opacity down/up
      if (e.ctrlKey && !e.shiftKey && e.key === '[') {
        e.preventDefault();
        const w = S.osWindows.find(w => w.id === focusedId);
        S.setOpacity(focusedId, Math.max(0.2, (w?.opacity ?? 1) - 0.1));
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key === ']') {
        e.preventDefault();
        const w = S.osWindows.find(w => w.id === focusedId);
        S.setOpacity(focusedId, Math.min(1, (w?.opacity ?? 1) + 0.1));
        return;
      }
      // Esc – unmaximize if maximized
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'Escape') {
        const w = S.osWindows.find(w => w.id === focusedId);
        if (w?.isMaximized) {
          e.preventDefault();
          S.toggleMaximize(focusedId);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleWindows = useMemo(() => {
    return osWindows
      .filter(w => w.workspace === activeWorkspace && !w.minimized && w.Component)
      .sort((a, b) => a.z - b.z);
  }, [osWindows, activeWorkspace]);

  return (
    <>
      {visibleWindows.map(w => (
        <Window key={w.id} win={w} focused={w.id === osFocusedId}>
          <AppErrorBoundary appId={w.appId}>
            {w.Component ? <w.Component /> : null}
          </AppErrorBoundary>
        </Window>
      ))}
    </>
  );
}