/*
Standalone Aliyun OCR tester for @alicloud/ocr20191230
Usage:
  DEBUG_OCR=1 node scripts/ocr-test.js [filePath]
Env (preferred):
  ALIBABA_CLOUD_ACCESS_KEY_ID, ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  ALIBABA_CLOUD_REGION, ALIBABA_CLOUD_OCR_ENDPOINT
Fallback envs:
  ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET, ALIYUN_REGION, ALIYUN_ENDPOINT
*/

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const OCRMod = require('@alicloud/ocr20191230');
const OpenApiMod = require('@alicloud/openapi-client');
const UtilMod = require('@alicloud/tea-util');

function pickCtor(mod, options) {
  for (const k of options) {
    if (mod && mod[k]) return mod[k];
  }
  return null;
}

const dbg = (...args) => { if (process.env.DEBUG_OCR === '1') console.log('[OCR-TEST]', ...args); };

function loadEnvFile(p) {
  try {
    if (!fs.existsSync(p)) return;
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
    dbg('Loaded env file', p);
  } catch {}
}

function getEnv(name, fallback) { return process.env[name] || fallback; }

async function main() {
  try {
    // Load .env.local and .env if present
    const root = process.cwd();
    loadEnvFile(path.join(root, '.env.local'));
    loadEnvFile(path.join(root, '.env'));
    const filePath = process.argv[2] || path.resolve('shu.png');
    const regionArg = process.argv[3];
    const endpointArg = process.argv[4];
    const regionId = regionArg || getEnv('ALIBABA_CLOUD_REGION', getEnv('ALIYUN_REGION', 'cn-shanghai'));
    const endpoint = endpointArg || getEnv('ALIBABA_CLOUD_OCR_ENDPOINT', getEnv('ALIYUN_ENDPOINT', 'ocr.cn-shanghai.aliyuncs.com'));
    const accessKeyId = getEnv('ALIBABA_CLOUD_ACCESS_KEY_ID', getEnv('ALIYUN_ACCESS_KEY_ID'));
    const accessKeySecret = getEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', getEnv('ALIYUN_ACCESS_KEY_SECRET'));

    if (!accessKeyId || !accessKeySecret) {
      console.error('Missing AK/SK in env. Please set ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET');
      process.exit(1);
    }

    console.log('Using:', { regionId, endpoint, filePath });
    const OpenApiConfig = pickCtor(OpenApiMod, ['Config', 'default']) || OpenApiMod;
    const RuntimeOptions = pickCtor(UtilMod, ['RuntimeOptions', 'default']) || UtilMod;
    const OCRClient = OCRMod.default || OCRMod.Client || OCRMod;
    const OCRNS = OCRMod.default && OCRMod.RecognizeAdvancedRequest ? OCRMod : OCRMod; // namespace holder

    const config = new OpenApiConfig({ accessKeyId, accessKeySecret, regionId, endpoint });
    const client = new OCRClient(config);
    const runtime = new RuntimeOptions({});
    const buf = await fsp.readFile(filePath);
    const base64 = Buffer.from(buf).toString('base64');

    // Introspect client methods
    const proto = Object.getPrototypeOf(client) || {};
    const methodNames = Object.getOwnPropertyNames(proto).filter((m) => typeof client[m] === 'function');
    console.log('Available methods:', methodNames.filter((m) => m.toLowerCase().includes('recognize') || m.toLowerCase().includes('async')).sort());
    const reqNames = Object.keys(OCRMod).concat(Object.keys(OCRMod.default || {})).filter((n, i, a) => a.indexOf(n) === i && /Request$/.test(n));
    console.log('Request classes present:', reqNames.sort());

    function get(qualName) {
      return OCRMod[qualName] || (OCRMod.default && OCRMod.default[qualName]);
    }
    const ext = path.extname(filePath).toLowerCase();
    const isPdf = ext === '.pdf';
    async function tryCalls() {
      if (isPdf) {
        // Prefer recognizePdfAdvance
        try {
          if (typeof client.recognizePdfAdvance === 'function' && get('RecognizePdfAdvanceRequest')) {
            dbg('calling recognizePdfAdvance');
            const Req = get('RecognizePdfAdvanceRequest');
            const req = new Req({ body: new Uint8Array(buf) });
            return await client.recognizePdfAdvance(req, runtime);
          }
        } catch (e) { dbg('pdfAdvance error', e.message); }
        try {
          if (typeof client.recognizePdfWithOptions === 'function' && get('RecognizePdfRequest')) {
            dbg('calling recognizePdfWithOptions');
            const Req = get('RecognizePdfRequest');
            // Some endpoints require URL instead of base64; leaving empty will likely fail, but attempt.
            const req = new Req({ imageURL: '', ImageURL: '' });
            return await client.recognizePdfWithOptions(req, runtime, {});
          }
        } catch (e) { dbg('pdfWithOptions error', e.message); }
      } else {
        // Image path: prefer recognizeCharacterAdvance
        try {
          if (typeof client.recognizeCharacterAdvance === 'function' && get('RecognizeCharacterAdvanceRequest')) {
            dbg('calling recognizeCharacterAdvance');
            const Req = get('RecognizeCharacterAdvanceRequest');
            const req = new Req({ body: new Uint8Array(buf) });
            return await client.recognizeCharacterAdvance(req, runtime);
          }
        } catch (e) { dbg('charAdvance error', e.message); }
        try {
          if (typeof client.recognizeCharacterWithOptions === 'function' && get('RecognizeCharacterRequest')) {
            dbg('calling recognizeCharacterWithOptions');
            const Req = get('RecognizeCharacterRequest');
            // Many services require ImageURL; base64 field names vary; try both keys as fallback
            const req = new Req({ imageURL: '', ImageURL: '' });
            return await client.recognizeCharacterWithOptions(req, runtime, {});
          }
        } catch (e) { dbg('charWithOptions error', e.message); }
      }
      return null;
    }

    let resp = await tryCalls();
    if (!resp && endpoint !== 'ocr-api.cn-hangzhou.aliyuncs.com') {
      console.log('Retrying with Hangzhou endpoint...');
      const cfg2 = new OpenApiConfig({ accessKeyId, accessKeySecret, regionId, endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com' });
      const client2 = new OCRClient(cfg2);
      resp = await (async () => {
        // reuse tryCalls with client2
        const c = client2;
        try {
          const Req = OCRMod.RecognizeAdvancedRequest || (OCRMod.default && OCRMod.default.RecognizeAdvancedRequest);
          if (Req && typeof c.recognizeAdvancedWithOptions === 'function') {
            const req = new Req({ body: new Uint8Array(buf) });
            return await c.recognizeAdvancedWithOptions(req, runtime, {});
          }
        } catch {}
        try {
          const Req = OCRMod.RecognizeAdvancedRequest || (OCRMod.default && OCRMod.default.RecognizeAdvancedRequest);
          if (Req && typeof c.recognizeAdvanced === 'function') {
            const req = new Req({ body: new Uint8Array(buf) });
            return await c.recognizeAdvanced(req);
          }
        } catch {}
        try {
          const Req = OCRMod.RecognizeGeneralRequest || (OCRMod.default && OCRMod.default.RecognizeGeneralRequest);
          if (Req && typeof c.recognizeGeneralWithOptions === 'function') {
            const req = new Req({ imageContent: base64, ImageContent: base64 });
            return await c.recognizeGeneralWithOptions(req, runtime, {});
          }
        } catch {}
        try {
          const Req = OCRMod.RecognizeGeneralRequest || (OCRMod.default && OCRMod.default.RecognizeGeneralRequest);
          if (Req && typeof c.recognizeGeneral === 'function') {
            const req = new Req({ imageContent: base64, ImageContent: base64 });
            return await c.recognizeGeneral(req);
          }
        } catch {}
        return null;
      })();
    }

    if (!resp) {
      console.error('No OCR method succeeded.');
      process.exit(2);
    }

    let body = resp.body || resp.Body || {};
    const jobId = body.jobId || body.JobId || body?.data?.jobId || body?.Data?.JobId;
    if (jobId && OCR.GetAsyncJobResultRequest) {
      console.log('Got JobId:', jobId, '— polling result...');
      const deadline = Date.now() + 30000;
      const clientPoll = client;
      const ReqRes = OCR.GetAsyncJobResultRequest;
      while (Date.now() < deadline) {
        const req = new ReqRes({ jobId });
        const r = await clientPoll.getAsyncJobResultWithOptions(req, runtime, {});
        const b = r.body || r.Body || {};
        const status = b?.data?.status || b?.Data?.Status || b?.status || b?.Status;
        dbg('poll status', status);
        if (!status || String(status).toLowerCase().includes('success') || String(status).toLowerCase().includes('finish')) {
          body = b;
          break;
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    // Normalize text extraction
    const data = body.data || body.Data || body;
    const lines = [];
    const results = data.results || data.Results || data.data || data.Data;
    if (Array.isArray(results)) {
      for (const r of results) {
        const t = r?.text || r?.Text || r?.content || r?.Content || r?.words || r?.Words;
        if (t) lines.push(String(t));
      }
    }
    const content = data.content || data.Content || body.content || body.Content;
    if (typeof content === 'string' && !lines.length) lines.push(content);
    const general = data.generalResult || data.GeneralResult;
    if (general) {
      const wordsInfo = general.wordsInfo || general.WordsInfo;
      if (Array.isArray(wordsInfo)) {
        for (const w of wordsInfo) {
          const t = w?.word || w?.Word;
          if (t) lines.push(String(t));
        }
      }
      if (typeof general.content === 'string') lines.push(general.content);
    }

    console.log('Extracted text length:', lines.join('\n').length);
    console.log('First 200 chars:\n', lines.join('\n').slice(0, 200));
    console.log('OK');
  } catch (e) {
    console.error('OCR test failed:', e && e.message ? e.message : e);
    process.exit(1);
  }
}

main();
