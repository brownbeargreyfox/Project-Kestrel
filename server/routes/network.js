import { Router } from 'express';
import os from 'node:os';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const router = Router();

const PRIVATE_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function isPrivateIPv4(ip) {
  return PRIVATE_RANGES.some((rx) => rx.test(ip));
}

function isUsableIPv4(ip) {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  if (!isPrivateIPv4(ip)) return false;
  const last = Number(ip.split('.').at(-1));
  return last > 0 && last < 255;
}

function isNoiseIPv4(ip) {
  return /^(0|127|169\.254|224|239|255)\./.test(ip);
}

function cleanMac(mac) {
  if (!mac) return null;
  const normalized = mac.toLowerCase().replace(/-/g, ':');
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalized)) return null;
  if (normalized === '00:00:00:00:00:00' || normalized === 'ff:ff:ff:ff:ff:ff') return null;
  return normalized;
}

function getLocalInterfaces() {
  const interfaces = os.networkInterfaces();
  const rows = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addr of addresses ?? []) {
      if (addr.family !== 'IPv4' || addr.internal || !isUsableIPv4(addr.address)) continue;
      rows.push({
        name,
        ip: addr.address,
        mac: cleanMac(addr.mac),
        netmask: addr.netmask,
        cidr: `${addr.address.split('.').slice(0, 3).join('.')}.0/24`,
      });
    }
  }

  return rows;
}

async function runArp() {
  const command = process.platform === 'win32' ? 'arp' : 'arp';
  const args = ['-a'];
  const { stdout } = await execFileAsync(command, args, { timeout: 5000, windowsHide: true });
  return stdout;
}

function parseArpTable(output) {
  const devices = new Map();
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    let ip = null;
    let mac = null;
    let type = 'arp';

    // Windows: 192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
    const win = line.match(/\b(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+(\w+)/);
    if (win) {
      ip = win[1];
      mac = cleanMac(win[2]);
      type = win[3]?.toLowerCase() ?? 'arp';
    }

    // macOS/BSD: ? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
    const bsd = line.match(/\((\d+\.\d+\.\d+\.\d+)\)\s+at\s+([0-9a-fA-F:]{17})/);
    if (!ip && bsd) {
      ip = bsd[1];
      mac = cleanMac(bsd[2]);
    }

    // Linux ip neigh-ish arp output: 192.168.1.1 ether aa:bb:cc:dd:ee:ff ...
    const nix = line.match(/\b(\d+\.\d+\.\d+\.\d+)\b.*\b([0-9a-fA-F:]{17})\b/);
    if (!ip && nix) {
      ip = nix[1];
      mac = cleanMac(nix[2]);
    }

    if (!ip || !mac || !isUsableIPv4(ip) || isNoiseIPv4(ip)) continue;

    devices.set(ip, {
      id: mac ?? ip,
      ip,
      mac,
      hostname: null,
      vendor: null,
      kind: inferDeviceKind(ip, mac),
      source: 'arp',
      arpType: type,
      lastSeen: new Date().toISOString(),
    });
  }

  return [...devices.values()].sort((a, b) => ipToNumber(a.ip) - ipToNumber(b.ip));
}

function ipToNumber(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inferDeviceKind(ip, mac) {
  const last = Number(ip.split('.').at(-1));
  if (last === 1 || last === 254) return 'router/gateway';
  if (!mac) return 'unknown';
  return 'network-device';
}

function getScanTargets(interfaces) {
  const targets = new Set();
  for (const net of interfaces) {
    const parts = net.ip.split('.');
    if (parts.length !== 4) continue;
    const prefix = parts.slice(0, 3).join('.');
    for (let i = 1; i <= 254; i += 1) {
      targets.add(`${prefix}.${i}`);
    }
  }
  return [...targets].filter(isUsableIPv4).slice(0, 512);
}

async function pingHost(ip) {
  const args = process.platform === 'win32'
    ? ['-n', '1', '-w', '450', ip]
    : ['-c', '1', '-W', '1', ip];

  try {
    await execFileAsync('ping', args, { timeout: 1500, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function runPool(items, limit, worker) {
  const results = [];
  let index = 0;

  async function next() {
    const current = index;
    index += 1;
    if (current >= items.length) return;
    results[current] = await worker(items[current]);
    await next();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function reverseLookup(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('dns-timeout')), 400)),
    ]);
    return names?.[0] ?? null;
  } catch {
    return null;
  }
}

async function enrichHostnames(devices) {
  await runPool(devices, 16, async (device) => {
    device.hostname = await reverseLookup(device.ip);
    if (device.hostname) {
      const h = device.hostname.toLowerCase();
      if (h.includes('router') || h.includes('gateway')) device.kind = 'router/gateway';
      else if (h.includes('phone') || h.includes('iphone') || h.includes('pixel')) device.kind = 'phone';
      else if (h.includes('camera') || h.includes('cam')) device.kind = 'camera/iot';
      else if (h.includes('tv') || h.includes('roku') || h.includes('chromecast')) device.kind = 'media/iot';
      else if (h.includes('printer')) device.kind = 'printer';
      else if (h.includes('pc') || h.includes('desktop') || h.includes('laptop')) device.kind = 'computer';
    }
  });
  return devices;
}

router.get('/devices', async (req, res) => {
  const startedAt = Date.now();
  const scanMode = req.query.scan === 'ping' ? 'ping' : 'passive';
  const interfaces = getLocalInterfaces();

  try {
    if (scanMode === 'ping') {
      const targets = getScanTargets(interfaces);
      await runPool(targets, 32, pingHost);
    }

    const arpOutput = await runArp();
    const devices = parseArpTable(arpOutput);

    for (const iface of interfaces) {
      if (!devices.some((device) => device.ip === iface.ip)) {
        devices.push({
          id: `local-${iface.ip}`,
          ip: iface.ip,
          mac: iface.mac,
          hostname: os.hostname(),
          vendor: null,
          kind: 'this-host',
          source: 'local-interface',
          arpType: null,
          lastSeen: new Date().toISOString(),
        });
      }
    }

    await enrichHostnames(devices);

    devices.sort((a, b) => ipToNumber(a.ip) - ipToNumber(b.ip));

    res.json({
      ok: true,
      scanMode,
      scannedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      interfaces,
      count: devices.length,
      devices,
      safety: {
        mode: scanMode === 'ping' ? 'bounded-icmp-ping-sweep' : 'passive-arp-cache',
        note: 'Designed for networks you own or administer. No port scanning or credential probing is performed.',
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message ?? 'Failed to read local network inventory',
      scanMode,
      interfaces,
      elapsedMs: Date.now() - startedAt,
    });
  }
});

export default router;
