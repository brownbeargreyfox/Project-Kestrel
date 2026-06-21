// src/plugins/aida/hooks/useAIDAStream.ts
//
// WebSocket stream hook for AIDA.
//
// Contract:
//   useAIDAStream({ url?, enabled? })
//   - No-op when enabled is false.
//   - Uses supplied url when present; otherwise VITE_AIDA_WS env var or the
//     locked default ws://localhost:7071/ws.
//   - Prevents state updates after unmount via closure `alive` flag.
//   - Cleans up cleanly: nulls handlers, closes socket.
//   - No reconnect storm: reconnect only happens when url/enabled deps change
//     (i.e., when the effect re-runs). Simple and safe.

import { useEffect } from 'react';
import type { Risk, AIDAAsset, AIDAEvent, SimulationResult } from '../../../Types/aida';
import { useAIDAStore } from '../store/useAIDAStore';

export interface UseAIDAStreamOptions {
  url?:     string;
  enabled?: boolean;
}

const DEFAULT_WS_URL: string =
  (import.meta.env['VITE_AIDA_WS'] as string | undefined) ?? 'ws://localhost:7071/ws';

export function useAIDAStream(options: UseAIDAStreamOptions = {}): void {
  const { url, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    const wsUrl = url ?? DEFAULT_WS_URL;

    useAIDAStore.getState().setConnectionState('connecting');

    // Construct socket — guard against invalid URL throwing synchronously
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      if (alive) {
        useAIDAStore.getState().setConnectionState('error');
        useAIDAStore.getState().setLastError(
          e instanceof Error ? e.message : String(e),
        );
      }
      return;
    }

    ws.onopen = () => {
      if (!alive) return;
      useAIDAStore.getState().setWsConnected(true);
      useAIDAStore.getState().setConnectionState('connected');
      useAIDAStore.getState().setLastError(null);
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      if (!alive) return;

      let msg: { type: string; payload: Record<string, unknown> };
      try {
        msg = JSON.parse(evt.data) as typeof msg;
      } catch {
        return;
      }

      const s = useAIDAStore.getState();

      switch (msg.type) {
        case 'hello': {
          const st = msg.payload['serverTime'];
          s.setServerTime(typeof st === 'string' ? st : null);
          break;
        }

        case 'event.appended':
          // payload shape is externally defined (WS contract); opaque cast is intentional
          s.ingestEvent(msg.payload as unknown as AIDAEvent);
          break;

        case 'assets.updated': {
          const assetId = msg.payload['id'];
          if (typeof assetId === 'string') {
            s.updateAsset(assetId, msg.payload as unknown as AIDAAsset);
          }
          break;
        }

        case 'simulation.result':
          s.setLastSim(msg.payload as unknown as SimulationResult);
          break;

        case 'risk_upsert':
          s.upsertRisk(msg.payload as unknown as Risk);
          break;

        case 'risk_delete': {
          const rid = msg.payload['id'];
          if (typeof rid === 'string') s.removeRisk(rid);
          break;
        }

        case 'batch_update': {
          const r = msg.payload['risks'];
          s.upsertRisks(Array.isArray(r) ? (r as unknown as Risk[]) : []);
          break;
        }

        default:
          break;
      }
    };

    ws.onerror = () => {
      if (!alive) return;
      useAIDAStore.getState().setConnectionState('error');
      useAIDAStore.getState().setLastError('WebSocket connection error');
    };

    ws.onclose = () => {
      if (!alive) return;
      useAIDAStore.getState().setWsConnected(false);
      useAIDAStore.getState().setConnectionState('disconnected');
    };

    return () => {
      alive = false;
      // Null out handlers so no callbacks fire after cleanup
      ws.onopen    = null;
      ws.onmessage = null;
      ws.onerror   = null;
      ws.onclose   = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, [url, enabled]);
}
