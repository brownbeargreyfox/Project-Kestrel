# Kestrel Runtime Smoke Checklist

Purpose: verify the desktop shell still behaves after build or shell changes.

## Preconditions

- Current branch is clean before testing: `git status --short`
- Dependencies installed: `npm install`
- Production build passes: `npm run build`
- Dev stack launches: `npm run dev`

## Manual smoke path

1. Open `http://localhost:5173/`.
2. Confirm the desktop shell renders with no red browser-console errors.
3. Open the app launcher.
4. Launch each registered app once:
   - Terminal
   - Files
   - Breach Monitor
   - Performance Metrics
   - Alert Center
   - Network Topology
   - Security Events
   - System Health
   - Plugin Diagnostics
5. Confirm re-clicking an already-open app focuses the existing window instead of duplicating it.
6. Drag a non-maximized window by the titlebar.
7. Resize a non-maximized window from the bottom-right handle.
8. Minimize and restore a window by launching that app again.
9. Maximize and restore a window.
10. Close a window.
11. Open Plugin Diagnostics and confirm the plugin panel renders.
12. Confirm `prefers-reduced-motion` does not block core navigation or controls.

## Useful selectors

- Launcher overlay: `[data-testid="app-launcher-overlay"]`
- Launcher panel: `[data-testid="app-launcher-panel"]`
- Launcher app: `[data-testid="app-launcher-app-<appId>"]`
- Window root: `[data-testid="window-<windowId>"]`
- Window titlebar: `[data-testid="window-titlebar-<windowId>"]`
- Window controls: `[data-testid="window-controls-<windowId>"]`
- Minimize: `[data-testid="window-minimize-<windowId>"]`
- Maximize: `[data-testid="window-maximize-<windowId>"]`
- Close: `[data-testid="window-close-<windowId>"]`
- Resize: `[data-testid="window-resize-<windowId>"]`

## Pass criteria

- `npm run build` passes.
- `npm run dev` launches FE and API.
- No red browser-console errors during smoke path.
- Windows drag, resize, minimize, maximize, restore, and close correctly.
- `git status --short` is clean after validation.
