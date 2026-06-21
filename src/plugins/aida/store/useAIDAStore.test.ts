// src/plugins/aida/store/useAIDAStore.test.ts
//
// Verification tests for useAIDAStore.
//
// No test runner is configured in this project. These tests are written with
// node:assert (Node built-in) and can be run directly via ts-node once the
// project's ESM setup is confirmed:
//
//   npx ts-node --experimental-vm-modules src/plugins/aida/store/useAIDAStore.test.ts
//
// To add a proper test runner without touching production code:
//   npm i -D vitest  →  add "test": "vitest" to package.json scripts
//   Rename this file to *.vitest.test.ts and swap node:assert for vi.expect
//
// Covered:
//   1. ingestEvent adds to front of events array
//   2. maxEvents cap is respected
//   3. upsertRisk / getRiskArray / getRiskById round-trip
//   4. removeRisk removes without mutating other keys
//   5. setFilters partial merge
//   6. setLayout partial merge
//   7. clearSelection resets selectedRiskId

import assert from 'node:assert/strict';
import { useAIDAStore } from './useAIDAStore';
import type { Risk, AIDAEvent } from '../../../Types/aida';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id:           'r1',
    type:         'cascade',
    severity:     'high',
    probability:  0.75,
    confidence:   0.82,
    timeToImpact: 4,
    eta:          { p10: 2, p50: 4, p90: 8 },
    title:        'Test risk',
    description:  'Test description',
    affected:     ['asset-01'],
    blastRadius:  3,
    mitigation:   'Test mitigation',
    model:        'test-model',
    explain:      'Test explanation',
    state:        'active',
    suppressions: [],
    createdAt:    '2026-01-01T00:00:00.000Z',
    updatedAt:    '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEvent(id: string): AIDAEvent {
  return { id, type: 'test.event', ts: Date.now(), source: 'test', payload: {} };
}

type InitialState = Parameters<typeof useAIDAStore.setState>[0];

const CLEAN: InitialState = {
  wsConnected:      false,
  connectionState:  'idle',
  serverTime:       null,
  lastError:        null,
  events:           [],
  assets:           {},
  lastSim:          null,
  maxEvents:        5,          // deliberately small for cap tests
  risks:            {},
  lastRiskUpdateTs: null,
  selectedRiskId:   null,
};

function reset() {
  useAIDAStore.setState(CLEAN);
}

// ── test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  reset();
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('ingestEvent adds event to front of array', () => {
  const s = useAIDAStore.getState();
  s.ingestEvent(makeEvent('e1'));
  s.ingestEvent(makeEvent('e2'));
  const events = useAIDAStore.getState().events;
  assert.equal(events.length, 2);
  assert.equal(events[0]?.id, 'e2');   // most recent first
  assert.equal(events[1]?.id, 'e1');
});

test('ingestEvent caps at maxEvents', () => {
  const s = useAIDAStore.getState();
  for (let i = 0; i < 8; i++) s.ingestEvent(makeEvent(`e${i}`));
  assert.equal(useAIDAStore.getState().events.length, 5); // maxEvents is 5 in CLEAN
});

test('upsertRisk adds to risks map', () => {
  useAIDAStore.getState().upsertRisk(makeRisk({ id: 'r1' }));
  const state = useAIDAStore.getState();
  assert.equal(Object.keys(state.risks).length, 1);
  assert.notEqual(state.lastRiskUpdateTs, null);
});

test('upsertRisks batch-adds multiple risks', () => {
  useAIDAStore.getState().upsertRisks([
    makeRisk({ id: 'r1' }),
    makeRisk({ id: 'r2' }),
    makeRisk({ id: 'r3' }),
  ]);
  assert.equal(useAIDAStore.getState().getRiskArray().length, 3);
});

test('getRiskById returns risk when present', () => {
  const risk = makeRisk({ id: 'r42' });
  useAIDAStore.getState().upsertRisk(risk);
  const found = useAIDAStore.getState().getRiskById('r42');
  assert.notEqual(found, undefined);
  assert.equal(found?.title, 'Test risk');
});

test('getRiskById returns undefined for unknown id', () => {
  assert.equal(useAIDAStore.getState().getRiskById('no-such-id'), undefined);
});

test('removeRisk removes only the target key', () => {
  const s = useAIDAStore.getState();
  s.upsertRisk(makeRisk({ id: 'keep' }));
  s.upsertRisk(makeRisk({ id: 'remove-me' }));
  s.removeRisk('remove-me');
  const state = useAIDAStore.getState();
  assert.equal(Object.keys(state.risks).length, 1);
  assert.notEqual(state.getRiskById('keep'), undefined);
  assert.equal(state.getRiskById('remove-me'), undefined);
});

test('removeRisk is a no-op for unknown id', () => {
  useAIDAStore.getState().upsertRisk(makeRisk({ id: 'r1' }));
  useAIDAStore.getState().removeRisk('nope');
  assert.equal(Object.keys(useAIDAStore.getState().risks).length, 1);
});

test('setFilters partial merge preserves unset keys', () => {
  useAIDAStore.getState().setFilters({ severity: 'high' });
  const f = useAIDAStore.getState().filters;
  assert.equal(f.severity, 'high');
  assert.equal(f.type, 'all');     // unchanged
  assert.equal(f.search, '');     // unchanged
});

test('setLayout partial merge preserves unset keys', () => {
  const before = useAIDAStore.getState().layout.showWorkflowActions;
  useAIDAStore.getState().setLayout({ showCalibration: true });
  const l = useAIDAStore.getState().layout;
  assert.equal(l.showCalibration, true);
  assert.equal(l.showWorkflowActions, before); // unchanged
});

test('clearSelection resets selectedRiskId', () => {
  useAIDAStore.getState().setSelectedRisk('r99');
  assert.equal(useAIDAStore.getState().selectedRiskId, 'r99');
  useAIDAStore.getState().clearSelection();
  assert.equal(useAIDAStore.getState().selectedRiskId, null);
});

test('setWsConnected / setConnectionState round-trip', () => {
  const s = useAIDAStore.getState();
  s.setWsConnected(true);
  s.setConnectionState('connected');
  assert.equal(useAIDAStore.getState().wsConnected, true);
  assert.equal(useAIDAStore.getState().connectionState, 'connected');
});

// ── report ────────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
