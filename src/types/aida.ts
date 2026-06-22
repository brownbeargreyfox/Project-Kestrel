// src/types/aida.ts
// Canonical AIDA contracts — shared across store, stream hook, and all AIDA views.
// Import with relative paths only (no @/... aliases).

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskType     = 'cascade' | 'anomaly' | 'prediction' | 'slo';
export type RiskState    = 'active' | 'acknowledged' | 'suppressed' | 'resolved';

export type AIDAConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface Risk {
  id:            string;
  type:          RiskType;
  severity:      RiskSeverity;
  probability:   number;
  confidence:    number;
  timeToImpact:  number;
  eta:           { p10: number; p50: number; p90: number };
  title:         string;
  description:   string;
  affected:      string[];
  blastRadius:   number;
  mitigation:    string;
  runbookUrl?:   string;
  model:         string;
  explain:       string;
  state:         RiskState;
  suppressions:  string[];
  createdAt:     string;
  updatedAt:     string;
}

export interface AIDAAsset {
  id:          string;
  name:        string;
  type:        string;
  status:      string;
  risk:        number;
  datacenter?: string;
  tier?:       string;
  metrics?:    Record<string, unknown>;
}

export interface AIDAEvent {
  id:      string;
  type:    string;
  ts:      number;
  source:  string;
  payload: Record<string, unknown>;
}

export interface SimulationResult {
  id:       string;
  assetId:  string;
  scenario: string;
  ts:       number;
  delta: {
    riskReduction:        number;
    healthImprovement:    number;
    cascadeRiskReduction: number;
  };
  before: Record<string, unknown>;
  after:  Record<string, unknown>;
}

export interface AIDAStreamMessage {
  type:    string;
  payload: Record<string, unknown>;
}

export interface RiskAction {
  type:   'ack' | 'assign' | 'suppress';
  riskId: string;
  actor?: string;
  note?:  string;
}

export interface AIDAFilterState {
  severity: RiskSeverity | 'all';
  type:     RiskType     | 'all';
  state:    RiskState    | 'all';
  search:   string;
}

export interface AIDALayoutState {
  showCalibration:    boolean;
  showWorkflowActions: boolean;
  useCanvas:          boolean;
}

export interface AIDAToast {
  id:       string;
  riskId:   string;
  title:    string;
  severity: RiskSeverity;
  ts:       number;
}
