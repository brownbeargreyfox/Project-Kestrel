// src/components/os/apps/NetworkMapApp.jsx
// Standalone Network Map window — promotes the map panel from NetworkTopologyApp
// into its own Kestrel app so drag/layout editing has full window real estate.
// Launched via launchApp('network-map') from the Network Inventory header.

import React from 'react';
import { Globe, RefreshCw, Save } from 'lucide-react';
import NetworkMapEdgeList from './NetworkMapEdgeList';

function formatDeviceName(device) {
  return device.displayName || device.label || device.hostname || device.mac || device.ip;
}

function toSvgCoords(svgEl, clientX, clientY) {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(ctm.inverse());
}

export default function NetworkMapApp() {
  const [devices, setDevices] = React.useState([]);
  const [mapLayout, setMapLayout] = React.useState(null);
  const [savingMap, setSavingMap] = React.useState(false);
  const [mapSaveMsg, setMapSaveMsg] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [selectedIp, setSelectedIp] = React.useState(null);
  const dragRef = React.useRef(null);
  const wasDragging = React.useRef(false);
  const [linkMode, setLinkMode] = React.useState(false);
  const [linkSource, setLinkSource] = React.useState(null); // nodeId of pending source
  const [linkMsg, setLinkMsg] = React.useState('');

  const loadDevices = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/network/devices');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setDevices(payload.devices ?? []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMapLayout = React.useCallback(async () => {
    try {
      const response = await fetch('/api/network/map-layout');
      const payload = await response.json();
      if (response.ok && payload.ok) {
        setMapLayout({ nodes: payload.nodes ?? [], edges: payload.edges ?? [], updatedAt: payload.updatedAt ?? null });
      }
    } catch {
      // non-fatal — map starts with no saved layout
    }
  }, []);

  React.useEffect(() => {
    loadDevices();
    loadMapLayout();
  }, [loadDevices, loadMapLayout]);

  const mapNodes = React.useMemo(() => {
    const savedByKey = new Map((mapLayout?.nodes ?? []).map((n) => [n.deviceKey, n]));
    const total = devices.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    return devices.map((device, index) => {
      const existing = savedByKey.get(device.deviceKey);
      if (existing) return existing;
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        id: device.deviceKey,
        deviceKey: device.deviceKey,
        x: 80 + col * 160,
        y: 60 + row * 100,
        pinned: false,
        label: formatDeviceName(device),
      };
    });
  }, [devices, mapLayout]);

  const saveMapLayout = React.useCallback(async () => {
    setSavingMap(true);
    setMapSaveMsg('');
    try {
      const response = await fetch('/api/network/map-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: mapNodes, edges: mapLayout?.edges ?? [] }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to save map layout');
      setMapLayout({ nodes: payload.nodes, edges: payload.edges, updatedAt: payload.updatedAt });
      setMapSaveMsg('Layout saved.');
    } catch (err) {
      setMapSaveMsg(err?.message ?? 'Failed to save map layout');
    } finally {
      setSavingMap(false);
    }
  }, [mapLayout, mapNodes]);

  // handleLinkClick: first call sets source, second call creates the edge (or reports error).
  // Duplicate check reads from mapLayout.edges in the closure (current render's committed state).
  const handleLinkClick = React.useCallback((nodeId) => {
    setLinkMsg('');
    if (!linkSource) {
      setLinkSource(nodeId);
      return;
    }
    if (linkSource === nodeId) {
      setLinkMsg('Cannot link a node to itself.');
      setLinkSource(null);
      return;
    }
    const sourceId = linkSource;
    const targetId = nodeId;
    const currentEdges = mapLayout?.edges ?? [];
    const isDuplicate = currentEdges.some(
      (e) =>
        (e.sourceId === sourceId && e.targetId === targetId) ||
        (e.sourceId === targetId && e.targetId === sourceId),
    );
    if (isDuplicate) {
      setLinkMsg('Edge already exists between these nodes.');
      setLinkSource(null);
      return;
    }
    setMapLayout((prev) => ({
      ...(prev ?? { nodes: [] }),
      edges: [
        ...(prev?.edges ?? []),
        { id: `logical:${sourceId}:${targetId}`, sourceId, targetId, kind: 'logical', label: 'manual' },
      ],
    }));
    setLinkSource(null);
  }, [linkSource, mapLayout?.edges]);

  const onUpdateEdge = React.useCallback((edgeId, patch) => {
    setMapLayout((prev) => ({
      ...(prev ?? { nodes: [] }),
      edges: (prev?.edges ?? []).map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    }));
  }, []);

  const onDeleteEdge = React.useCallback((edgeId) => {
    setMapLayout((prev) => ({
      ...(prev ?? { nodes: [] }),
      edges: (prev?.edges ?? []).filter((e) => e.id !== edgeId),
    }));
  }, []);

  // Manual edges are identified by their stable `logical:` id namespace (set at
  // creation), not by their `kind` — kind is now user-editable and must not make
  // the row vanish from the list.
  const manualEdges = (mapLayout?.edges ?? []).filter((e) => typeof e.id === 'string' && e.id.startsWith('logical:'));

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="network-map-app">
      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe size={20} className="text-sky-300" />
            <h2 className="text-lg font-semibold">Network Map</h2>
            {mapLayout?.updatedAt && (
              <span className="ml-1 text-xs font-normal text-neutral-500">
                · saved {new Date(mapLayout.updatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {error && <span className="text-xs text-red-400">{error}</span>}
            {mapSaveMsg && <span className="text-xs text-neutral-400">{mapSaveMsg}</span>}
            {linkMsg && <span className="text-xs text-amber-400">{linkMsg}</span>}
            {linkMode && !linkMsg && (
              <span className="text-xs text-neutral-500">
                {linkSource ? 'click target node' : 'click source node'}
              </span>
            )}
            <button
              type="button"
              aria-pressed={linkMode}
              onClick={() => { setLinkMode((m) => !m); setLinkSource(null); setLinkMsg(''); }}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm ${
                linkMode
                  ? 'border-amber-600 bg-amber-950/60 text-amber-200 hover:bg-amber-900/60'
                  : 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800'
              }`}
              data-testid="network-map-link-mode"
            >
              {linkMode ? 'Exit Link Mode' : 'Link Mode'}
            </button>
            <button
              type="button"
              onClick={loadDevices}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={saveMapLayout}
              disabled={savingMap || devices.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
              data-testid="network-map-save"
            >
              <Save size={14} />
              {savingMap ? 'Saving…' : 'Save Map'}
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
          {(() => {
            const PAD = 80;
            let minX, minY, maxX, maxY;
            if (mapNodes.length > 0) {
              minX = Math.min(...mapNodes.map((n) => n.x)) - PAD;
              minY = Math.min(...mapNodes.map((n) => n.y)) - PAD;
              maxX = Math.max(...mapNodes.map((n) => n.x)) + PAD;
              maxY = Math.max(...mapNodes.map((n) => n.y)) + PAD;
            } else {
              minX = 0; minY = 0; maxX = 820; maxY = 400;
            }
            const vw = Math.max(820, maxX - minX);
            const vh = Math.max(400, maxY - minY);
            return (
              <svg
                viewBox={`${minX} ${minY} ${vw} ${vh}`}
                xmlns="http://www.w3.org/2000/svg"
                className="w-full min-w-[400px]"
                style={{ minHeight: 480 }}
                data-testid="network-map-canvas"
                onPointerMove={(e) => {
                  const drag = dragRef.current;
                  if (!drag) return;
                  const pt = toSvgCoords(e.currentTarget, e.clientX, e.clientY);
                  if (!pt) return;
                  const dx = pt.x - drag.pointerOriginX;
                  const dy = pt.y - drag.pointerOriginY;
                  if (dx * dx + dy * dy < 9) return;
                  wasDragging.current = true;
                  const nx = drag.nodeOriginX + dx;
                  const ny = drag.nodeOriginY + dy;
                  setMapLayout((prev) => {
                    const nodes = prev?.nodes ?? [];
                    const exists = nodes.some((n) => n.id === drag.nodeId);
                    const updated = exists
                      ? nodes.map((n) => n.id === drag.nodeId ? { ...n, x: nx, y: ny, pinned: true } : n)
                      : [...nodes, { id: drag.nodeId, deviceKey: drag.nodeId, x: nx, y: ny, pinned: true, label: drag.nodeLabel }];
                    return { ...(prev ?? { edges: [] }), nodes: updated };
                  });
                }}
                onPointerUp={() => { dragRef.current = null; }}
                onPointerCancel={() => { dragRef.current = null; }}
              >
                {/* Edges drawn before nodes so nodes render on top */}
                {(mapLayout?.edges ?? []).map((edge) => {
                  const src = mapNodes.find((n) => n.id === edge.sourceId);
                  const tgt = mapNodes.find((n) => n.id === edge.targetId);
                  if (!src || !tgt) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={src.x} y1={src.y}
                      x2={tgt.x} y2={tgt.y}
                      stroke="#404040" strokeWidth={1.5}
                    />
                  );
                })}
                {mapNodes.map((node) => {
                  const device = devices.find((d) => d.deviceKey === node.deviceKey);
                  const riskLevel = device?.risk?.level;
                  const riskStroke = riskLevel === 'critical' ? '#dc2626'
                    : riskLevel === 'high' ? '#ea580c'
                    : riskLevel === 'medium' ? '#d97706'
                    : riskLevel === 'low' ? '#0284c7'
                    : '#059669';
                  const isLinkSrc = linkMode && node.id === linkSource;
                  const showSelected = !linkMode && device?.ip === selectedIp;
                  const nodeStroke = isLinkSrc ? '#f59e0b' : showSelected ? '#38bdf8' : riskStroke;
                  const nodeFill = isLinkSrc ? '#1c1400' : showSelected ? '#0c2240' : '#0d0d0d';
                  const strokeW = (isLinkSrc || showSelected) ? 2 : 1.5;
                  const displayLabel = (node.label || device?.displayName || '').slice(0, 22);
                  const ipLabel = (device?.ip || node.id.replace(/^(mac:|ip:)/, '')).slice(0, 22);
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x},${node.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={displayLabel || node.id}
                      data-testid="network-map-node"
                      onClick={() => {
                        if (wasDragging.current) { wasDragging.current = false; return; }
                        if (linkMode) { handleLinkClick(node.id); return; }
                        device && setSelectedIp((prev) => prev === device.ip ? null : device.ip);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        if (linkMode) { handleLinkClick(node.id); return; }
                        device && setSelectedIp((prev) => prev === device.ip ? null : device.ip);
                      }}
                      onPointerDown={(e) => {
                        wasDragging.current = false;
                        const svgEl = e.currentTarget.ownerSVGElement;
                        if (!svgEl) return;
                        const pt = toSvgCoords(svgEl, e.clientX, e.clientY);
                        if (!pt) return;
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                        dragRef.current = {
                          nodeId: node.id,
                          nodeLabel: node.label || '',
                          pointerOriginX: pt.x,
                          pointerOriginY: pt.y,
                          nodeOriginX: node.x,
                          nodeOriginY: node.y,
                        };
                      }}
                      style={{ cursor: linkMode ? 'crosshair' : 'grab', touchAction: 'none' }}
                    >
                      <rect
                        x={-64} y={-22} width={128} height={44} rx={6}
                        fill={nodeFill}
                        stroke={nodeStroke}
                        strokeWidth={strokeW}
                      />
                      <text x={0} y={-5} textAnchor="middle" fill="#f3f4f6" fontSize={11} fontWeight={600}>
                        {displayLabel}
                      </text>
                      <text x={0} y={10} textAnchor="middle" fill="#6b7280" fontSize={10}>
                        {ipLabel}
                      </text>
                    </g>
                  );
                })}
                {devices.length === 0 && (
                  <text x={minX + Math.floor(vw / 2)} y={minY + Math.floor(vh / 2)} textAnchor="middle" fill="#4b5563" fontSize={13}>
                    No devices — click Refresh to populate the map.
                  </text>
                )}
              </svg>
            );
          })()}
        </div>
      </div>

      <NetworkMapEdgeList
        edges={manualEdges}
        mapNodes={mapNodes}
        onDeleteEdge={onDeleteEdge}
        onUpdateEdge={onUpdateEdge}
      />
    </div>
  );
}
