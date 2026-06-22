// Test cases for NetworkRiskExplainer.jsx
// Covers success/error states, button disabled logic, accessibility, state cleanup

export const TEST_CASES = {
  buttonDisabledNoDevice: {
    description: 'Explain Risk button is disabled when no device selected',
    device: null,
    expectedState: 'disabled',
  },

  loadingState: {
    description: 'Button shows loading state (aria-busy, Loader icon, "Analyzing…") while fetching',
    device: { deviceKey: 'abc', ip: '192.168.1.1' },
    expectedState: 'explaining',
    expectedUI: ['aria-busy=true', 'Loader icon', '"Analyzing…"'],
  },

  successResponse: {
    description: 'Success renders evidence, confidenceInputs, counterpoints, recommendedChecks, brokerRequest',
    device: { deviceKey: 'abc', ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff', hostname: 'router', vendor: 'TP-Link' },
    expectedSections: ['evidence', 'confidenceInputs', 'counterpoints', 'recommendedChecks', 'brokerRequest'],
    expectedTexts: ['MAC:', 'aa:bb:cc:dd:ee:ff', 'Confidence Inputs', 'Recommended Checks'],
    shouldNotCallModel: true,
  },

  errorResponse: {
    description: 'Error response shows error message and does not render explainer sections',
    device: { deviceKey: 'abc', ip: '192.168.1.1' },
    expectedUI: ['AlertCircle icon', 'error message'],
    shouldNotRender: ['evidence', 'confidenceInputs'],
  },

  resultsClearOnDeviceChange: {
    description: 'When selectedDevice changes, previous results and errors are cleared',
    behavior: 'useEffect cleanup on device?.deviceKey',
  },

  brokerRequestNoDelegation: {
    description: 'brokerRequest is shown as informational with "No model has been called yet" messaging',
    shouldNotHave: 'execute button for brokerRequest',
  },

  keyboardAccessibility: {
    description: 'Button is keyboard-accessible (native button, supports Enter/Space)',
    requirements: ['native <button> element', 'disabled attribute (not aria-disabled)', 'aria-label for button purpose'],
  },
};

export const VERIFICATION_CHECKLIST = {
  integration: [
    'NetworkRiskExplainer imported in NetworkTopologyApp.jsx',
    'Component rendered in device details section (after risk signals)',
    'Section has data-testid="network-risk-explainer"',
    'Button has data-testid="network-explain-risk"',
  ],
  fetchBehavior: [
    'POST to /api/network-risk/explain with { device: selectedDevice }',
    'Checks response.ok and payload.ok',
    'Sends Content-Type: application/json',
  ],
  rendering: [
    'Evidence: MAC, hostname, vendor, trust, tags',
    'Confidence Inputs: evidenceConfidence, missingEvidencePenalty, riskSignalCount',
    'Counterpoints: bulleted list (<ul>)',
    'Recommended Checks: numbered list (<ol>)',
    'brokerRequest: <details> section with collapsed prompt view',
  ],
  noModelCall: [
    'Text: "No model has been called yet"',
    'Prompt shown in <details><pre>',
    'No button to execute brokerRequest',
    'No auto-call on success',
  ],
  states: [
    'Empty state: "Select Explain Risk to analyze..."',
    'Loading: "Analyzing…" with spinner icon',
    'Error: AlertCircle + error message',
    'Success: all sections rendered',
  ],
  stateCleanup: [
    'useEffect clears result/error when device?.deviceKey changes',
  ],
  accessibility: [
    'native <button> element',
    'aria-busy="true" when explaining',
    'aria-label on button',
    'disabled attribute (not aria-disabled)',
  ],
};
