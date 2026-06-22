// src/components/os/apps/networkRiskExplainerHelpers.ts
//
// Pure, framework-free helpers for the deterministic Network Risk Explainer
// (issue #15). Kept separate from the React panel/sections so they stay
// unit-testable without a DOM and the panel keeps a single responsibility.

export type Json = Record<string, any>;

export interface ExplainResponse extends Json {
  ok?: boolean;
  evidence?: Json;
  confidenceInputs?: Json;
  counterpoints?: string[];
  recommendedChecks?: string[];
  operatorChecks?: string[];
  checks?: string[];
  brokerRequest?: Json;
  brokerRequestPreview?: Json;
}

/**
 * POST the selected device to the deterministic explainer and return the payload.
 * Performs exactly one request. Throws on transport failure or a non-ok payload,
 * surfacing the server-provided error message when present.
 */
export async function explainDeviceRisk(
  device: Json,
  fetchImpl: typeof fetch = fetch,
): Promise<ExplainResponse> {
  const response = await fetchImpl('/api/network-risk/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device }),
  });

  let payload: ExplainResponse = {};
  try {
    payload = (await response.json()) as ExplainResponse;
  } catch {
    payload = {};
  }

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(
      (payload && payload.error) || `Explain risk failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

// Tolerant field readers so renamed/missing backend fields degrade gracefully.

export function readChecks(result: ExplainResponse | null): string[] {
  if (!result) return [];
  const value = result.recommendedChecks ?? result.operatorChecks ?? result.checks;
  return Array.isArray(value) ? value : [];
}

export function readBrokerRequest(result: ExplainResponse | null): Json | null {
  if (!result) return null;
  return result.brokerRequest ?? result.brokerRequestPreview ?? null;
}
