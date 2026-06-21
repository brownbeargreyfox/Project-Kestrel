// src/components/os/Window.jsx
import React from 'react';
import { useUIStore } from '../../store/useUIStore.ts';
import ContextMenu from './ContextMenu.jsx';

const WINDOWS_BASE_Z = 200;
const MIN_WINDOW_W = 380;
const MIN_WINDOW_H = 240;

export default function Window({ win, focused, children }) {
  const {
    focusWindow, commitMove, commitResize,
    minimizeWindow, closeWindow, toggleMaximize, setOpacity, recoverWindow,
  } = useUIStore(s => s);

  const [dragging, setDragging] = React.useState(false);
  const [resizing, setResizing] = React.useState(false);
  const [menu, setMenu] = React.useState(null);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);
  const [tw, setTw] = React.useState(win.w);
  const [th, setTh] = React.useState(win.h);

  const offRef = React.useRef({ x: 0, y: 0 });
  const txRef = React.useRef(0);
  const tyRef = React.useRef(0);
  const twRef = React.useRef(win.w);
  const thRef = React.useRef(win.h);

  React.useEffect(() => {
    if (resizing) return;
    twRef.current = win.w;
    thRef.current = win.h;
    setTw(win.w);
    setTh(win.h);
  }, [resizing, win.w, win.h]);

  const onDragStart = (e) => {
    if (win.isMaximized || e.button !== 0) return;
    e.preventDefault();
    focusWindow(win.id);
    offRef.current = { x: e.clientX - win.x, y: e.clientY - win.y };
    txRef.current = 0;
    tyRef.current = 0;
    setTx(0);
    setTy(0);
    setDragging(true);
  };

  const onResizeStart = (e) => {
    if (win.isMaximized || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    focusWindow(win.id);
    twRef.current = win.w;
    thRef.current = win.h;
    setTw(win.w);
    setTh(win.h);
    setResizing(true);
  };

  const onTitlebarContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    focusWindow(win.id);
    setMenu({ x: e.clientX, y: e.clientY });
  };

  React.useEffect(() => {
    if (!dragging && !resizing) return undefined;

    const mm = (e) => {
      if (dragging) {
        const nextTx = e.clientX - offRef.current.x - win.x;
        const nextTy = e.clientY - offRef.current.y - win.y;
        txRef.current = nextTx;
        tyRef.current = nextTy;
        setTx(nextTx);
        setTy(nextTy);
        return;
      }

      if (resizing) {
        const nextW = Math.max(MIN_WINDOW_W, e.clientX - win.x);
        const nextH = Math.max(MIN_WINDOW_H, e.clientY - win.y);
        twRef.current = nextW;
        thRef.current = nextH;
        setTw(nextW);
        setTh(nextH);
      }
    };

    const mu = () => {
      if (dragging) {
        commitMove(win.id, win.x + txRef.current, win.y + tyRef.current);
        txRef.current = 0;
        tyRef.current = 0;
        setTx(0);
        setTy(0);
      }

      if (resizing) {
        commitResize(win.id, twRef.current, thRef.current);
      }

      setDragging(false);
      setResizing(false);
    };

    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu, { once: true });

    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
  }, [dragging, resizing, win.id, win.x, win.y, commitMove, commitResize]);

  const style = {
    left:   win.isMaximized ? 0 : win.x,
    top:    win.isMaximized ? 0 : win.y,
    width:  win.isMaximized ? '100%' : resizing ? tw : win.w,
    height: win.isMaximized ? '100%' : resizing ? th : win.h,
    zIndex: WINDOWS_BASE_Z + (win.z ?? 0),
    transform: win.isMaximized ? 'none' : `translate(${tx}px, ${ty}px)`,
    opacity: win.opacity ?? 1,
    backgroundColor: 'rgba(23,23,23,0.9)',
    backdropFilter: 'blur(6px)',
  };

  const menuItems = [
    { label: 'Move to Visible Area', action: () => recoverWindow(win.id) },
    { label: win.isMaximized ? 'Restore' : 'Maximize', action: () => toggleMaximize(win.id) },
    { label: 'Minimize', action: () => minimizeWindow(win.id) },
    { separator: true },
    { label: 'Opacity +', action: () => setOpacity(win.id, Math.min(1, (win.opacity ?? 1) + 0.1)) },
    { label: 'Opacity −', action: () => setOpacity(win.id, Math.max(0.2, (win.opacity ?? 1) - 0.1)) },
    { separator: true },
    { label: 'Close', action: () => closeWindow(win.id), danger: true },
  ];

  return (
    <div
      role="region"
      aria-label={`${win.title ?? 'Kestrel'} window`}
      data-testid={`window-${win.id}`}
      data-window-id={win.id}
      className={`absolute rounded-xl shadow-2xl border border-neutral-700 bg-neutral-900/80
                  ${focused ? 'ring-2 ring-sky-500' : ''}`}
      style={style}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Titlebar */}
      <div
        data-testid={`window-titlebar-${win.id}`}
        className={`h-9 px-3 flex items-center justify-between select-none rounded-t-xl
                    ${win.isMaximized ? 'cursor-default' : 'cursor-move'} bg-neutral-800`}
        onMouseDown={onDragStart}
        onContextMenu={onTitlebarContext}
      >
        <div className="font-medium truncate" data-testid={`window-title-${win.id}`}>{win.title ?? ''}</div>
        <div
          className="flex items-center gap-2"
          data-testid={`window-controls-${win.id}`}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          {/* Opacity quick controls */}
          <button
            className="text-xs px-2 py-0.5 rounded hover:bg-neutral-700"
            title={`Opacity ${Math.round((win.opacity ?? 1) * 100)}% (Ctrl+[ / Ctrl+])`}
            aria-label={`Decrease opacity for ${win.title ?? 'window'}`}
            data-testid={`window-opacity-down-${win.id}`}
            onClick={(e) => { e.stopPropagation(); setOpacity(win.id, Math.max(0.2, (win.opacity ?? 1) - 0.1)); }}
          >−opacity</button>
          <button
            className="text-xs px-2 py-0.5 rounded hover:bg-neutral-700"
            aria-label={`Increase opacity for ${win.title ?? 'window'}`}
            data-testid={`window-opacity-up-${win.id}`}
            onClick={(e) => { e.stopPropagation(); setOpacity(win.id, Math.min(1, (win.opacity ?? 1) + 0.1)); }}
          >+opacity</button>

          {/* Minimize / Maximize / Close */}
          <button
            className="hover:text-blue-300"
            title="Minimize (Ctrl+M)"
            aria-label={`Minimize ${win.title ?? 'window'}`}
            data-testid={`window-minimize-${win.id}`}
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
          >—</button>
          <button
            className="hover:text-blue-300"
            title="Maximize/Restore (Ctrl+Shift+↑)"
            aria-label={`${win.isMaximized ? 'Restore' : 'Maximize'} ${win.title ?? 'window'}`}
            data-testid={`window-maximize-${win.id}`}
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
          >
            {win.isMaximized ? '▢' : '⬜'}
          </button>
          <button
            className="hover:text-red-400"
            title="Close (Ctrl+W)"
            aria-label={`Close ${win.title ?? 'window'}`}
            data-testid={`window-close-${win.id}`}
            onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
          >×</button>
        </div>
      </div>

      {/* Content */}
      <div className="h-[calc(100%-2.25rem)] p-2 overflow-auto" data-testid={`window-content-${win.id}`}>{children}</div>

      {/* Resize handle */}
      {!win.isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
          aria-hidden="true"
          data-testid={`window-resize-${win.id}`}
          onMouseDown={onResizeStart}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}