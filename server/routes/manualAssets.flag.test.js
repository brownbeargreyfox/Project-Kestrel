// server/routes/manualAssets.flag.test.js
//
// Locks in the server-side workflow-action gate resolution order so a future
// refactor cannot silently drop the VITE_FF_WORKFLOW_ACTIONS compatibility
// fallback. Node built-ins only.
//
// Run:
//   node --test server/routes/manualAssets.flag.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { isWorkflowActionsEnabled } from './manualAssets.js';

test('KESTREL_WORKFLOW_ACTIONS=true enables write actions (preferred flag)', () => {
  assert.equal(isWorkflowActionsEnabled({ KESTREL_WORKFLOW_ACTIONS: 'true' }), true);
});

test('KESTREL_WORKFLOW_ACTIONS=false hard-disables even if VITE fallback is true', () => {
  assert.equal(
    isWorkflowActionsEnabled({ KESTREL_WORKFLOW_ACTIONS: 'false', VITE_FF_WORKFLOW_ACTIONS: 'true' }),
    false,
  );
});

test('falls back to VITE_FF_WORKFLOW_ACTIONS=true when KESTREL is unset (compatibility)', () => {
  assert.equal(isWorkflowActionsEnabled({ VITE_FF_WORKFLOW_ACTIONS: 'true' }), true);
});

test('falls back to VITE_FF when KESTREL holds a non-boolean value', () => {
  assert.equal(
    isWorkflowActionsEnabled({ KESTREL_WORKFLOW_ACTIONS: 'yes', VITE_FF_WORKFLOW_ACTIONS: 'true' }),
    true,
  );
});

test('disabled by default when neither flag is set', () => {
  assert.equal(isWorkflowActionsEnabled({}), false);
});

test('VITE_FF must be exactly "true" to enable (no truthy coercion)', () => {
  assert.equal(isWorkflowActionsEnabled({ VITE_FF_WORKFLOW_ACTIONS: 'false' }), false);
  assert.equal(isWorkflowActionsEnabled({ VITE_FF_WORKFLOW_ACTIONS: '1' }), false);
});
