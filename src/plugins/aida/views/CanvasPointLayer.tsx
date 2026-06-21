// src/plugins/aida/views/CanvasPointLayer.tsx
//
// High-performance canvas renderer for risk point sets.
// Uses a spatial grid index for O(1) average hit-testing — avoids n² linear
// scans even at 1000+ points.
//
// SVG is preferable for small sets (< ~200 points); use this component only
// when ff_canvas_layer is enabled.

import React from 'react';

// ── public types ─────────────────────────────────────────────────────────────

export interface CanvasPoint {
  id:        string;
  x:         number; // canvas-space pixel coordinates
  y:         number;
  radius:    number;
  color:     string;
  label?:    string;
}

export interface CanvasPointLayerProps {
  points:      CanvasPoint[];
  width:       number;
  height:      number;
  selectedId?: string | null;
  onSelect?:   (id: string | null) => void;
  onHover?:    (id: string | null) => void;
  className?:  string;
}

// ── grid index ────────────────────────────────────────────────────────────────

const CELL = 32; // pixels per grid cell

type GridIndex = Map<string, string[]>;
type PointMap  = Map<string, CanvasPoint>;

function buildGridIndex(points: CanvasPoint[]): GridIndex {
  const index: GridIndex = new Map();
  for (const pt of points) {
    const minCX = Math.max(0, Math.floor((pt.x - pt.radius) / CELL));
    const maxCX = Math.floor((pt.x + pt.radius) / CELL);
    const minCY = Math.max(0, Math.floor((pt.y - pt.radius) / CELL));
    const maxCY = Math.floor((pt.y + pt.radius) / CELL);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx},${cy}`;
        const cell = index.get(key);
        if (cell !== undefined) {
          cell.push(pt.id);
        } else {
          index.set(key, [pt.id]);
        }
      }
    }
  }
  return index;
}

function hitTest(
  index: GridIndex,
  byId: PointMap,
  x: number,
  y: number,
): string | null {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const candidates = index.get(`${cx},${cy}`) ?? [];
  for (const id of candidates) {
    const pt = byId.get(id);
    if (pt === undefined) continue;
    const dx = x - pt.x;
    const dy = y - pt.y;
    if (dx * dx + dy * dy <= pt.radius * pt.radius) return id;
  }
  return null;
}

// ── canvas drawing ────────────────────────────────────────────────────────────

function drawAll(
  ctx:        CanvasRenderingContext2D,
  points:     CanvasPoint[],
  selectedId: string | null | undefined,
  hoveredId:  string | null,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const pt of points) {
    const isSel = pt.id === selectedId;
    const isHov = !isSel && pt.id === hoveredId;
    const r = pt.radius * (isSel ? 1.45 : isHov ? 1.2 : 1);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
    ctx.globalAlpha = isSel ? 1 : isHov ? 0.88 : 0.72;
    ctx.fillStyle   = pt.color;
    ctx.fill();

    if (isSel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export const CanvasPointLayer: React.FC<CanvasPointLayerProps> = ({
  points,
  width,
  height,
  selectedId,
  onSelect,
  onHover,
  className = '',
}) => {
  const canvasRef  = React.useRef<HTMLCanvasElement>(null);
  const hoveredRef = React.useRef<string | null>(null);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  // Rebuild grid index and point map only when the point array changes
  const { gridIndex, byId } = React.useMemo(() => {
    const idx = buildGridIndex(points);
    const map: PointMap = new Map(points.map((p) => [p.id, p]));
    return { gridIndex: idx, byId: map };
  }, [points]);

  // Redraw whenever relevant state changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    drawAll(ctx, points, selectedId, hoveredId);
  }, [points, selectedId, hoveredId]);

  // Mouse handlers
  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTest(gridIndex, byId, x, y);
      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        setHoveredId(hit);
        onHover?.(hit);
      }
    },
    [gridIndex, byId, onHover],
  );

  const handleMouseLeave = React.useCallback(() => {
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      setHoveredId(null);
      onHover?.(null);
    }
  }, [onHover]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const hit  = hitTest(gridIndex, byId, e.clientX - rect.left, e.clientY - rect.top);
      onSelect?.(hit === selectedId ? null : hit);
    },
    [gridIndex, byId, selectedId, onSelect],
  );

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ cursor: hoveredId !== null ? 'pointer' : 'default' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      aria-label="Risk point layer"
      role="img"
    />
  );
};
