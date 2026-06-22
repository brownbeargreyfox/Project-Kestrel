// src/types/maia.ts
// Canonical MAIA v0 UI contracts — shared by the MAIA memory panel and cards.
// Import with relative paths only (no @/... aliases). No React in this file.

export type MAIAMemoryKind =
  | 'aida.recommendation.accepted'
  | 'aida.recommendation.dismissed'
  | 'aida.simulation.run'
  | 'aida.observation.insight'
  | 'operator.note'
  | 'maia.correction';

export type MAIASource = 'aida' | 'operator' | 'system';

export interface MAIAConfidence {
  value: number;
  basis: string;
  lowCoverage: boolean;
}

export interface MAIAProvenance {
  route?: string;
  actor?: string;
  auditId?: string;
  recommendationId?: string;
  simulationId?: string;
  sourceEventType?: string;
}

export interface MAIAMemoryNode {
  id: string;
  version: 1;
  ts: string;
  kind: MAIAMemoryKind;
  source: MAIASource;
  assetId?: string;
  assetName?: string;
  summary: string;
  detail?: string;
  tags: string[];
  confidence: MAIAConfidence;
  provenance: MAIAProvenance;
  revisionOf?: string | null;
}

export interface MAIAInsightNodeRef {
  id: string;
  ts: string;
  kind: MAIAMemoryKind;
  summary: string;
  assetId?: string;
}

export interface MAIAInsight {
  id: string;
  assetId?: string;
  assetName?: string;
  summary: string;
  whyItMatters: string;
  relevanceScore: number;
  confidence: MAIAConfidence;
  memoryNodes: MAIAInsightNodeRef[];
  coverageWarnings: string[];
}

export interface MAIACoverageSummary {
  totalNodes: number;
  assetsCovered: number;
  byKind: Record<string, number>;
  bySource: Record<string, number>;
  oldest: string | null;
  newest: string | null;
  lowCoverage: boolean;
  warnings: string[];
}

export interface MAIAQuery {
  assetId?: string;
  q?: string;
  kind?: MAIAMemoryKind | '';
  limit?: number;
}
