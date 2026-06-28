# Network Map — Manual Smoke Checklist

> **Why this is a manual checklist.** The repo has no React component test
> harness (no Vitest/Jest/Testing Library/jsdom/Playwright/Cypress), and the
> existing automated tests run under Node's built-in `node --test` for
> backend/pure-logic code only. Until a frontend test harness is adopted as a
> separate, scoped decision, the interactive Network Map behaviors below are
> verified manually using this checklist.
>
> Adopting a DOM-based component harness would add dependencies and is therefore
> intentionally **out of scope** here.

Covers the standalone Network Map app
(`src/components/os/apps/NetworkMapApp.jsx`) and its edge editor
(`src/components/os/apps/NetworkMapEdgeList.jsx`), as built across PRs #49–#52:

- #49 — Network Map extracted into its own app.
- #50 — manual Link Mode edges.
- #51 — editable edge kind/label; `NetworkMapEdgeList` extracted.
- #52 — workflow-gated **Send Map to AIDA**.

Run each section in order on a fresh dev session. Check the box when the
observed behavior matches. Note the relevant `data-testid` in parentheses for
locating elements.

---

## 1. Baseline load

- [ ] Start the app with a normal dev env (`npm run dev`).
- [ ] Open **Network Inventory**.
- [ ] Click **Open Map** (`network-open-map`).
- [ ] Confirm the **Network Map** app loads (`network-map-app`).
- [ ] Confirm map nodes render (`network-map-node`) for the discovered devices.
- [ ] Confirm the **Save Map** button is visible (`network-map-save`).
- [ ] Confirm **Send Map to AIDA** (`network-map-send-to-aida`) is **hidden**
      when `VITE_FF_WORKFLOW_ACTIONS` is `false` or unset.

## 2. Drag / pin / save

- [ ] Drag a node to a new position.
- [ ] Confirm the node moves and stays where dropped (pinned).
- [ ] Click **Save Map** (`network-map-save`).
- [ ] Refresh or reopen the Network Map app.
- [ ] Confirm the node remains in its saved position.

## 3. Link Mode edge creation

- [ ] Enable **Link Mode** (`network-map-link-mode`).
- [ ] Select the first node (click or focus + Enter).
- [ ] Select a second, different node.
- [ ] Confirm one edge line appears on the canvas between the two nodes.
- [ ] Confirm the edge appears as a row in the edge list
      (`network-map-edge-list`).

## 4. Self-link rejection

- [ ] Enable **Link Mode**.
- [ ] Select the same node twice.
- [ ] Confirm a rejection message appears (e.g. "Cannot link a node to itself.").
- [ ] Confirm **no** new edge is created (edge list count unchanged).

## 5. Duplicate A↔B rejection

- [ ] Create an A→B edge.
- [ ] Attempt a B→A edge (reverse direction, same pair).
- [ ] Confirm a duplicate rejection message appears
      (e.g. "Edge already exists between these nodes.").
- [ ] Confirm only **one** edge remains for that pair.

## 6. Edge metadata editing

- [ ] Change an edge's **kind** to `ethernet` (`network-map-edge-kind`).
- [ ] Change the edge's **label** (`network-map-edge-label`).
- [ ] Confirm the row stays visible after the kind change
      (it is not filtered out by the kind switch).
- [ ] Click **Save Map**.
- [ ] Refresh or reopen the map.
- [ ] Confirm the edited kind and label persist.

## 7. Edge deletion

- [ ] Click **Delete** on an edge (`network-map-edge-delete`).
- [ ] Confirm the edge disappears locally (canvas + edge list).
- [ ] Click **Save Map**.
- [ ] Refresh or reopen the map.
- [ ] Confirm the edge remains deleted.

## 8. Send Map to AIDA flag gate

- [ ] With `VITE_FF_WORKFLOW_ACTIONS` `false`/unset, **Send Map to AIDA**
      (`network-map-send-to-aida`) is **absent**.
- [ ] With `VITE_FF_WORKFLOW_ACTIONS=true`, the button **appears**.
- [ ] With server workflow gating disabled, clicking it shows the **403 disabled**
      message ("Manual asset actions are disabled. Enable the workflow-actions
      flag to add to AIDA.").
- [ ] With both client flag and server gating enabled, the send **succeeds** and
      shows the **Open AIDA Sentinel** button
      (`network-map-open-aida-sentinel`).
- [ ] Click **Open AIDA Sentinel** and confirm the AIDA Sentinel app launches.

## 9. Privacy check

Inspect the request body of `POST /api/aida/assets/manual` (browser devtools →
Network) after a successful **Send Map to AIDA**.

- [ ] Confirm the map snapshot under `currentIncident.mapPayload.nodes` contains
      only `id`, `deviceKey`, `x`, `y`, `pinned`, `label` per node.
- [ ] Confirm **no** full device objects are sent (no `risk`, `mac`, `tags`,
      `identity`, etc.).
- [ ] Confirm **no** IPs are included except values that are already visible in a
      node's `label`.

## 10. Regression checks

- [ ] Dragging a node does **not** create an edge (even in Link Mode).
- [ ] Link Mode does **not** break Enter-key node selection/linking.
- [ ] Edge metadata edits do **not** POST until **Save Map** is clicked.
- [ ] **Send Map to AIDA** does **not** save the map layout
      (no `POST /api/network/map-layout`).
- [ ] **Save Map** does **not** send to AIDA
      (no `POST /api/aida/assets/manual`).

---

## Required command checks

These automated suites must pass before merging map-related changes. They cover
the backend contracts the Network Map app depends on; the UI behaviors above
remain manual until a frontend harness exists.

```sh
node --test server/routes/network.map.test.js
node --test server/routes/network.wmi.test.js
node --test server/routes/network.discovery.test.js
npm run test:aida:manual-assets
npm run build
```
