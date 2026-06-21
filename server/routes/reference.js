import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

const router = Router();
const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const DEFAULT_OUI_FILE = path.join(STATE_DIR, 'reference', 'oui.txt');

let cachedRegistry = null;
let cachedSourcePath = null;
let cachedMtimeMs = null;

function getOuiFilePath() {
  return path.resolve(process.env.KESTREL_OUI_FILE || DEFAULT_OUI_FILE);
}

function normalizeOui(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 6);
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

function normalizeMac(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (normalized.length < 6 || normalized.length > 12) return null;
  if (!/^[0-9A-F]+$/.test(normalized)) return null;
  return normalized;
}

function formatOui(prefix) {
  if (!prefix || prefix.length !== 6) return null;
  return `${prefix.slice(0, 2)}:${prefix.slice(2, 4)}:${prefix.slice(4, 6)}`;
}

function parseOuiText(raw) {
  const entries = new Map();
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const hexMatch = line.match(/^\s*([0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2}){2})\s+\(hex\)\s+(.+?)\s*$/);
    const base16Match = line.match(/^\s*([0-9A-Fa-f]{6})\s+\(base 16\)\s+(.+?)\s*$/);
    const match = hexMatch || base16Match;
    if (!match) continue;

    const prefix = normalizeOui(match[1]);
    const organization = match[2]?.trim();
    if (!prefix || !organization) continue;

    if (!entries.has(prefix)) {
      entries.set(prefix, {
        prefix,
        prefixColon: formatOui(prefix),
        organization,
        source: 'local-oui-reference',
      });
    }
  }

  return entries;
}

async function loadRegistry({ force = false } = {}) {
  const sourcePath = getOuiFilePath();
  const stat = await fs.stat(sourcePath);

  if (
    !force
    && cachedRegistry
    && cachedSourcePath === sourcePath
    && cachedMtimeMs === stat.mtimeMs
  ) {
    return {
      sourcePath,
      mtimeMs: stat.mtimeMs,
      loadedAt: cachedRegistry.loadedAt,
      entries: cachedRegistry.entries,
    };
  }

  const raw = await fs.readFile(sourcePath, 'utf8');
  const entries = parseOuiText(raw);

  cachedRegistry = {
    loadedAt: new Date().toISOString(),
    entries,
  };
  cachedSourcePath = sourcePath;
  cachedMtimeMs = stat.mtimeMs;

  return {
    sourcePath,
    mtimeMs: stat.mtimeMs,
    loadedAt: cachedRegistry.loadedAt,
    entries,
  };
}

async function getRegistryStatus() {
  const sourcePath = getOuiFilePath();
  try {
    const registry = await loadRegistry();
    return {
      ok: true,
      enabled: true,
      sourcePath,
      loadedAt: registry.loadedAt,
      entryCount: registry.entries.size,
      message: 'Local OUI reference is loaded.',
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        ok: true,
        enabled: false,
        sourcePath,
        loadedAt: null,
        entryCount: 0,
        message: 'Local OUI reference file not found. Copy an IEEE OUI text export to this path or set KESTREL_OUI_FILE.',
      };
    }

    return {
      ok: false,
      enabled: false,
      sourcePath,
      loadedAt: null,
      entryCount: 0,
      error: error?.message ?? 'Failed to load local OUI reference.',
    };
  }
}

async function lookupOui(value) {
  const normalized = normalizeMac(value);
  if (!normalized) return null;
  const prefix = normalizeOui(normalized);
  if (!prefix) return null;
  const registry = await loadRegistry();
  const match = registry.entries.get(prefix) ?? null;

  if (!match) {
    return {
      prefix,
      prefixColon: formatOui(prefix),
      organization: null,
      source: 'local-oui-reference',
      matched: false,
    };
  }

  return {
    ...match,
    matched: true,
  };
}

export async function lookupLocalOui(value) {
  return lookupOui(value);
}

export async function enrichNetworkInventoryPayload(payload) {
  if (!payload?.ok || !Array.isArray(payload.devices)) return payload;

  let status;
  try {
    status = await getRegistryStatus();
    if (!status.enabled) {
      return {
        ...payload,
        ouiReference: status,
      };
    }
  } catch (error) {
    return {
      ...payload,
      ouiReference: {
        ok: false,
        enabled: false,
        sourcePath: getOuiFilePath(),
        error: error?.message ?? 'Failed to inspect OUI reference.',
      },
    };
  }

  const devices = [];
  for (const device of payload.devices) {
    const match = device.mac ? await lookupOui(device.mac) : null;
    const vendor = match?.organization || device.vendor || null;
    const identity = device.identity
      ? {
          ...device.identity,
          likelyVendor: device.identity.likelyVendor || vendor,
          sources: match?.matched
            ? [...new Set([...(device.identity.sources || []), 'local-oui-reference'])]
            : device.identity.sources,
          reasons: match?.matched
            ? [
                ...(device.identity.reasons || []),
                `Local OUI reference maps ${match.prefixColon} to “${match.organization}”.`,
              ]
            : device.identity.reasons,
        }
      : device.identity;

    devices.push({
      ...device,
      vendor,
      vendorSource: match?.matched ? match.source : device.vendorSource ?? null,
      oui: match,
      identity,
    });
  }

  return {
    ...payload,
    ouiReference: status,
    devices,
  };
}

router.get('/oui/status', async (req, res) => {
  const status = await getRegistryStatus();
  res.status(status.ok ? 200 : 500).json(status);
});

router.post('/oui/reload', async (req, res) => {
  try {
    const registry = await loadRegistry({ force: true });
    res.json({
      ok: true,
      sourcePath: registry.sourcePath,
      loadedAt: registry.loadedAt,
      entryCount: registry.entries.size,
    });
  } catch (error) {
    res.status(error?.code === 'ENOENT' ? 404 : 500).json({
      ok: false,
      sourcePath: getOuiFilePath(),
      error: error?.message ?? 'Failed to reload local OUI reference.',
    });
  }
});

router.get('/oui/lookup/:mac', async (req, res) => {
  try {
    const result = await lookupOui(req.params.mac);
    if (!result) {
      return res.status(400).json({ ok: false, error: 'Invalid MAC or OUI value.' });
    }
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(error?.code === 'ENOENT' ? 404 : 500).json({
      ok: false,
      sourcePath: getOuiFilePath(),
      error: error?.message ?? 'Failed to lookup OUI.',
    });
  }
});

router.post('/oui/lookup', async (req, res) => {
  try {
    const values = Array.isArray(req.body?.values) ? req.body.values.slice(0, 512) : [];
    if (values.length === 0) {
      return res.status(400).json({ ok: false, error: 'Provide values: string[] with at least one MAC or OUI.' });
    }

    const results = [];
    for (const value of values) {
      const result = await lookupOui(value);
      if (result) results.push({ value, result });
    }

    return res.json({ ok: true, count: results.length, results });
  } catch (error) {
    return res.status(error?.code === 'ENOENT' ? 404 : 500).json({
      ok: false,
      sourcePath: getOuiFilePath(),
      error: error?.message ?? 'Failed to lookup OUI batch.',
    });
  }
});

export default router;
