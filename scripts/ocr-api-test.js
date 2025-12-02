/*
Standalone tester for Aliyun OCR API 20210707 using URL input.
Usage:
  node scripts/ocr-api-test.js <url> [endpoint]
Env (auto-detected):
  ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET (optional if using default credentials)
  ALIBABA_CLOUD_OCRAPI_ENDPOINT (default: ocr-api.cn-hangzhou.aliyuncs.com)
*/

const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const ocrApiMod = require('@alicloud/ocr-api20210707');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');
const Credential = require('@alicloud/credentials');

function pick(mod, names) {
  for (const n of names) if (mod && mod[n]) return mod[n];
  return null;
}

async function main() {
  // Load .env.local and .env like Next does
  try {
    const root = process.cwd();
    for (const name of ['.env.local', '.env']) {
      const p = require('node:path').join(root, name);
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      raw.split(/\r?\n/).forEach((line) => {
        const l = line.trim();
        if (!l || l.startsWith('#')) return;
        const m = l.match(/^([A-Za-z_][A-Za-z0-9_\.]*)\s*=\s*(.*)$/);
        if (!m) return;
        const key = m[1];
        let val = m[2];
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!(key in process.env)) process.env[key] = val;
      });
    }
  } catch {}
  const url = process.argv[2] || process.env.OCR_TEST_URL;
  const endpoint = process.argv[3] || process.env.ALIBABA_CLOUD_OCRAPI_ENDPOINT || 'ocr-api.cn-hangzhou.aliyuncs.com';
  if (!url) {
    console.error('Usage: node scripts/ocr-api-test.js <url> [endpoint]');
    process.exit(1);
  }

  // Quick reachability check for the URL
  await new Promise((resolve) => {
    try {
      const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        console.log('URL reachability:', res.statusCode, res.statusMessage);
        res.resume();
        resolve();
      });
      req.on('timeout', () => { console.warn('URL HEAD timeout (8s)'); req.destroy(); resolve(); });
      req.on('error', (err) => { console.warn('URL HEAD error:', err.message); resolve(); });
      req.end();
    } catch (e) { console.warn('URL HEAD exception:', e.message); resolve(); }
  });

  const ConfigCtor = pick(OpenApi, ['Config', 'default']) || OpenApi;
  const ak = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || process.env.ALIYUN_ACCESS_KEY_ID;
  const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || process.env.ALIYUN_ACCESS_KEY_SECRET;
  let config;
  if (ak && sk) {
    config = new ConfigCtor({ accessKeyId: ak, accessKeySecret: sk, endpoint });
  } else {
    const credClient = new Credential.default();
    const cred = await credClient.getCredential();
    config = new ConfigCtor({
      accessKeyId: cred.accessKeyId,
      accessKeySecret: cred.accessKeySecret,
      securityToken: cred.securityToken,
      endpoint,
    });
  }
  const ClientCtor = ocrApiMod.default || ocrApiMod;
  const client = new ClientCtor(config);
  const RuntimeOptions = pick(Util, ['RuntimeOptions', 'default']) || Util;
  const readTimeout = Number(process.env.OCR_READ_TIMEOUT_MS || 60000);
  const connectTimeout = Number(process.env.OCR_CONNECT_TIMEOUT_MS || 15000);
  const runtime = new RuntimeOptions({ readTimeout, connectTimeout });

  const Req = ocrApiMod.RecognizeAdvancedRequest || (ocrApiMod.default && ocrApiMod.default.RecognizeAdvancedRequest);
  if (!Req || typeof client.recognizeAdvancedWithOptions !== 'function') {
    console.error('SDK does not expose RecognizeAdvancedWithOptions; available keys:', Object.keys(ocrApiMod));
    process.exit(2);
  }
  const req = new Req({ url });
  async function callOnce(ep) {
    const cfg = new ConfigCtor({ ...config, endpoint: ep });
    const cli = new ClientCtor(cfg);
    try {
      const resp = await cli.recognizeAdvancedWithOptions(req, runtime);
      const body = resp.body || resp.Body || resp;
      console.log('Raw response body keys:', Object.keys(body || {}));
      const data = body.Data || body.data || body;
      let text = '';
      if (typeof data === 'string') {
        try { const j = JSON.parse(data); text = j.content || ''; } catch { /* ignore */ }
      }
      console.log('Extracted content length:', text.length);
      console.log('Sample content (first 200):\n', text.slice(0, 200));
      console.log('OK');
      return true;
    } catch (err) {
      console.error('Call failed on', ep, ':', err && err.message ? err.message : err);
      if (err && err.data && err.data.Recommend) console.log('Recommend:', err.data.Recommend);
      return false;
    }
  }

  const tried = [];
  const candidates = [endpoint, 'ocr-api.cn-shanghai.aliyuncs.com', 'ocr-api.cn-hangzhou.aliyuncs.com'];
  for (const ep of candidates) {
    if (tried.includes(ep)) continue;
    tried.push(ep);
    const ok = await callOnce(ep);
    if (ok) process.exit(0);
  }
  process.exit(3);
}

main();
