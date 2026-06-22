import { Router } from 'express';

const router = Router();

function sanitizeText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildEvidence(device) {
  const identity = device?.identity ?? {};
  const risk = device?.risk ?? {};
  const oui = device?.oui ?? null;

  return {
    deviceKey: sanitizeText(device?.deviceKey, 120),
    ip: sanitizeText(device?.ip, 64),
    mac: sanitizeText(device?.mac, 64),
    hostname: sanitizeText(device?.hostname, 200),
    displayName: sanitizeText(device?.displayName, 200),
    kind: sanitizeText(device?.kind, 80),
    trustState: sanitizeText(device?.trustState, 40) || 'unknown',
    tags: asArray(device?.tags).slice(0, 12).map((tag) => sanitizeText(tag, 32)).filter(Boolean),
    label: sanitizeText(device?.label, 120),
    firstSeen: sanitizeText(device?.firstSeen, 80),
    lastSeen: sanitizeText(device?.lastSeen, 80),
    isNew: Boolean(device?.isNew),
    vendor: sanitizeText(device?.vendor || identity?.likelyVendor || oui?.organization, 200),
    vendorSource: sanitizeText(device?.vendorSource || oui?.source, 120),
    oui: oui ? {
      prefix: sanitizeText(oui.prefix, 24),
      organization: sanitizeText(oui.organization, 200),
      matched: Boolean(oui.matched),
    } : null,
    identity: {
      likelyVendor: sanitizeText(identity.likelyVendor, 200),
      likelyFamily: sanitizeText(identity.likelyFamily, 200),
      confidence: typeof identity.confidence === 'number' ? identity.confidence : null,
      sources: asArray(identity.sources).slice(0, 12).map((source) => sanitizeText(source, 80)).filter(Boolean),
      reasons: asArray(identity.reasons).slice(0, 12).map((reason) => sanitizeText(reason, 240)).filter(Boolean),
    },
    risk: {
      score: Number.isFinite(risk.score) ? risk.score : 0,
      level: sanitizeText(risk.level, 40) || 'clear',
      signals: asArray(risk.signals).slice(0, 16).map((signal) => ({
        severity: sanitizeText(signal?.severity, 40),
        score: Number.isFinite(signal?.score) ? signal.score : 0,
        title: sanitizeText(signal?.title, 160),
        detail: sanitizeText(signal?.detail, 300),
      })),
    },
  };
}

function scoreEvidence(evidence) {
  let score = 0;
  let missing = 0;

  if (evidence.mac) score += 20; else missing += 15;
  if (evidence.hostname) score += 15; else missing += 10;
  if (evidence.vendor) score += 20; else missing += 15;
  if (evidence.identity.confidence !== null) score += Math.round(evidence.identity.confidence * 25); else missing += 10;
  if (evidence.trustState && evidence.trustState !== 'unknown') score += 10;
  if (evidence.risk.signals.length > 0) score += 10;

  return {
    evidenceConfidence: Math.max(0, Math.min(100, score)),
    missingEvidencePenalty: Math.max(0, Math.min(100, missing)),
    riskSignalCount: evidence.risk.signals.length,
  };
}

function buildCounterpoints(evidence) {
  const counterpoints = [];

  if (!evidence.hostname) counterpoints.push('No hostname is visible; device role may be benign but opaque.');
  if (!evidence.vendor) counterpoints.push('No vendor match is available; avoid over-identifying the device.');
  if (evidence.mac && evidence.vendor && /apple|google|samsung|android|iphone/i.test(evidence.vendor)) {
    counterpoints.push('Mobile devices may use private or randomized MAC behavior depending on network settings.');
  }
  if (evidence.isNew) counterpoints.push('Newly seen does not mean malicious; it may be a returning or newly powered device.');
  if (evidence.trustState === 'trusted') counterpoints.push('Trusted label lowers concern, but stale labels should be verified after topology changes.');

  return counterpoints.length > 0 ? counterpoints : ['No obvious counterpoint was detected from the available inventory fields.'];
}

function buildChecks(evidence) {
  const checks = [
    'Verify the device in the router, switch, DHCP, or controller client list.',
    'Compare MAC/vendor/hostname against expected asset inventory.',
    'Label the device in Kestrel as trusted, watch, or blocked once verified.',
  ];

  if (!evidence.hostname) checks.push('Check whether DNS, DHCP lease name, or controller alias can identify the device.');
  if (evidence.isNew) checks.push('Physically account for newly powered, joined, or roaming devices.');
  if (evidence.risk.level === 'high' || evidence.risk.level === 'critical') checks.push('Escalate to packet/log review before taking any disruptive action.');

  return checks;
}

function buildPrompt(evidence, confidence, counterpoints, checks) {
  return [
    'You are AIDA, a sysadmin advisor. You do not take action. Explain this network inventory finding using only the evidence provided.',
    '',
    'Evidence:',
    JSON.stringify(evidence, null, 2),
    '',
    'Confidence inputs:',
    JSON.stringify(confidence, null, 2),
    '',
    'Counterpoints to consider:',
    JSON.stringify(counterpoints, null, 2),
    '',
    'Recommended operator checks:',
    JSON.stringify(checks, null, 2),
    '',
    'Return: finding, likely explanations, risk reasoning, counterpoints, confidence, and next checks. Do not recommend destructive action.',
  ].join('\n');
}

router.get('/template', (req, res) => {
  res.json({
    ok: true,
    route: 'POST /api/network-risk/explain',
    required: ['device'],
    optional: ['context'],
    output: ['evidence', 'confidenceInputs', 'counterpoints', 'recommendedChecks', 'brokerRequest'],
  });
});

router.post('/explain', (req, res) => {
  const device = req.body?.device;
  if (!device || typeof device !== 'object') {
    return res.status(400).json({ ok: false, error: 'Provide device object from Network Inventory.' });
  }

  const evidence = buildEvidence(device);
  const confidenceInputs = scoreEvidence(evidence);
  const counterpoints = buildCounterpoints(evidence);
  const recommendedChecks = buildChecks(evidence);
  const prompt = buildPrompt(evidence, confidenceInputs, counterpoints, recommendedChecks);

  return res.json({
    ok: true,
    evidence,
    confidenceInputs,
    counterpoints,
    recommendedChecks,
    brokerRequest: {
      method: 'POST',
      path: '/api/ai/broker/complete',
      body: {
        provider: 'local-ollama',
        prompt,
        temperature: 0.2,
        timeoutMs: 20000,
      },
    },
  });
});

export default router;
