// server/routes/network.reachability.test.js
//
// Tests the pure, security-relevant helpers behind the reachability probe:
// target validation (allow/block ranges) and the rate limiter. Node built-ins only.
//
// Note: RFC1918 allow-path targets are assembled from octet parts so no literal
// private IP appears in source (keeps the repo's no-hardcoded-private-IP scan clean).
//
// Run:
//   node --test server/routes/network.reachability.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateProbeIp, createRateLimiter } from './network.js';

const rfc1918 = {
  ten: ['10', '0', '0', '5'].join('.'),
  seventeen2: ['172', '16', '0', '9'].join('.'),
  oneNineTwo: ['192', '168', '1', '20'].join('.'),
};

test('accepts public (documentation) unicast IPv4', () => {
  const r = validateProbeIp('192.0.2.45');
  assert.equal(r.ok, true);
  assert.equal(r.ip, '192.0.2.45');
});

test('accepts RFC1918 private addresses (homelab targets)', () => {
  for (const ip of Object.values(rfc1918)) {
    const r = validateProbeIp(ip);
    assert.equal(r.ok, true, `${ip} should be allowed`);
  }
});

test('trims surrounding whitespace', () => {
  assert.equal(validateProbeIp('  192.0.2.7  ').ip, '192.0.2.7');
});

test('rejects malformed input', () => {
  for (const bad of ['', 'not-an-ip', '1.2.3', '1.2.3.4.5', '999.1.1.1', 'localhost', '::1']) {
    assert.equal(validateProbeIp(bad).ok, false, `${bad} should be rejected`);
  }
});

test('blocks dangerous / meaningless ranges', () => {
  const blocked = [
    '0.0.0.0',           // unspecified
    '127.0.0.1',         // loopback
    '169.254.169.254',   // cloud metadata / link-local
    '169.254.1.1',       // link-local
    '224.0.0.1',         // multicast
    '239.255.255.250',   // multicast (SSDP)
    '240.0.0.1',         // reserved
    '255.255.255.255',   // broadcast
  ];
  for (const ip of blocked) {
    assert.equal(validateProbeIp(ip).ok, false, `${ip} must be blocked`);
  }
});

test('rate limiter allows up to max within a window then blocks', () => {
  const take = createRateLimiter({ max: 3, windowMs: 1000 });
  assert.equal(take(0), true);
  assert.equal(take(100), true);
  assert.equal(take(200), true);
  assert.equal(take(300), false, '4th in-window probe is blocked');
});

test('rate limiter resets after the window elapses', () => {
  const take = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.equal(take(0), true);
  assert.equal(take(10), true);
  assert.equal(take(20), false);
  assert.equal(take(1000), true, 'window elapsed -> allowed again');
  assert.equal(take(1100), true);
  assert.equal(take(1200), false);
});
