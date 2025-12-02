import OpenAI from "openai";
import type { AuditCheck, AuditResult, ContractCategory } from "./types";
import { CATEGORY_DEFS, CATEGORY_NAMES } from "./categories";
import { CANONICAL_RULES } from "./rules";

export function hasLLM(): boolean {
  return !!(process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || process.env.MOONSHOT_API_KEY);
}

type AnalyzeInput = {
  url?: string; // single image URL
  urls?: string[]; // multiple image URLs (e.g., PDF pages)
  textHint?: string; // Optional pre-extracted text for fallback/context
  expectedName?: string;
  mime?: string;
};

type AnalyzeOutput = { audit: AuditResult; category?: ContractCategory };

export async function analyzeWithQwen({ url, urls, textHint, expectedName, mime }: AnalyzeInput): Promise<AnalyzeOutput> {
  const vendor = (process.env.LLM_VENDOR || (process.env.OPENAI_API_KEY ? "openai" : (process.env.DASHSCOPE_API_KEY ? "dashscope" : (process.env.MOONSHOT_API_KEY ? "moonshot" : "dashscope")))).toLowerCase();
  const apiKey = vendor === 'openai' ? (process.env.OPENAI_API_KEY!) : vendor === 'moonshot' ? (process.env.MOONSHOT_API_KEY!) : (process.env.DASHSCOPE_API_KEY!);
  const baseURL = vendor === 'openai'
    ? (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1")
    : vendor === 'moonshot'
      ? (process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1")
      : (process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const client = new OpenAI({ apiKey, baseURL });
  const DEBUG = process.env.DEBUG_LLM === '1';

  const categories = CATEGORY_NAMES as readonly ContractCategory[];

  const system = "You are Kimi.";

  const pyRulesHeader =
    "你是合同预审核助手。立场：‘我方’固定为标准署名（默认上海大学材料科学与工程学院），‘对方’为与我方相对一方。\n" +
    `我方=${expectedName || "上海大学材料科学与工程学院"}。请严格按固定规则输出：\n`;
  const pyRule1 = `合同主体名称必须正确、完整；并且‘我方’名称必须与标准署名完全一致（标准署名：${expectedName || "上海大学材料科学与工程学院"}，逐字匹配，不允许全角/半角、空格或括号形态差异）。`;
  const pyRulesList = [
    pyRule1,
    "若合同已有对方盖章，则合同文本中的对方名称必须与印章印文一致。",
    "对方已盖章且多页或有附件，应加盖骑缝章。",
    "禁止在空白文本或未成文载体上盖对方印章。",
    "对方签章必须齐全，包括对方印章（如需盖章）和对方签名/授权人签字。",
    "合同签署日期必须存在（若盖章则应在邻近标注日期）。",
    "对方主体名称、签名栏信息和印章印文需一致。",
  ];
  const pyJsonSchema = `\n输出合法 JSON（只输出 JSON，不要额外文本）：\n{\n  \"ok\": boolean,\n  \"checks\": [{\"name\": string, \"ok\": boolean, \"message\": string}],\n  \"category\": string,\n  \"recognized\": {\n    \"seals\": [{\"side\": \"我方\"|\"对方\"|\"未知\", \"imprint_text\": string, \"near_text\": string|null}],\n    \"signatures\": [{\"side\": \"我方\"|\"对方\"|\"未知\", \"name\": string|null, \"label\": string|null}]\n  },\n  \"strict\": {\n    \"partyA_name\": string|null,\n    \"partyB_name\": string|null,\n    \"my_side\": \"甲方/需方\"|\"乙方/供方\"|\"未知\",\n    \"expected_match_exact\": boolean\n  }\n}\n`;
  const pyStrict = "严格性要求：\n- 第一条必须基于‘完全一致(逐字相等)’判断我方名称是否等于标准署名；若不完全一致，即判定为 false（可在 message 中说明近似/宽松匹配情况，但不影响结果）。此外：checks[0].ok 必须与 strict.expected_match_exact 完全一致，不得自相矛盾；若不一致，以 strict.expected_match_exact 为准。\n" +
    "- 甲/乙/供/需关系：甲方=需方，乙方=供方。\n- 判断‘我方’：若甲/乙任意一方名称与标准署名完全一致，则该方为我方；若都不一致，默认甲方(需方)为我方。相关规则中的‘对方’为相对的一方。\n" +
    "- checks 必须包含全部7项，顺序与名称完全一致，不得遗漏；若无法识别某项，也必须输出该项并设置 ok=false，message 简述原因。\n" +
    "在 checks 的第一条 message 中，必须列出识别到的甲/需与乙/供名称，以及与标准署名的匹配结果（完全一致/不一致）。\n" +
    "在 recognized.seals 中，给出识别到的印章印文文本（imprint_text）及其附近文字（near_text），并标注 side；\n" +
    "在 recognized.signatures 中，给出识别到的签名/委托代理人信息（name 或 label，例如‘委托代理人’），并标注 side。\n";
  const rules = pyRulesHeader + pyRulesList.map((r, i) => `${i + 1}) ${r}`).join("\n") + pyJsonSchema + pyStrict + `分类可选：${categories.join("/")}`;

  const content: any[] = [];
  // limit to 5 pages for cost
  let allUrls = (urls && urls.length) ? urls.slice(0, 5) : (url ? [url] : []);
  // Moonshot 强制使用 base64 data: URL 以避免外链不可访问
  if (vendor === 'moonshot' && allUrls.length > 0) {
    const inlined: string[] = [];
    for (const u of allUrls) {
      if (/^data:/i.test(u)) { inlined.push(u); continue; }
      try {
        const resp = await fetch(u);
        if (!resp.ok) throw new Error(`fetch ${u} ${resp.status}`);
        const ct = resp.headers.get('content-type') || mime || 'image/png';
        if (!/^image\//i.test(ct)) throw new Error(`unsupported content-type ${ct}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const b64 = buf.toString('base64');
        inlined.push(`data:${ct};base64,${b64}`);
      } catch (e) {
        if (DEBUG) console.error('[LLM] inline data-url failed', (e as any)?.message || e);
      }
    }
    allUrls = inlined;
  }
  for (const u of allUrls) {
    content.push({ type: "image_url", image_url: { url: u } });
  }
  if (textHint) {
    content.push({ type: "text", text: `以下为辅助文本（如不一致以图文/链接为准）：\n${truncate(textHint, 8000)}` });
  }
  content.push({ type: "text", text: rules });

  // Try preferred and fallback models
  let vlCandidates: string[];
  let textCandidates: string[];
  if (vendor === 'openai') {
    // Primary requested model
    const primary = process.env.LLM_VL_MODEL || process.env.OPENAI_VL_MODEL || "gpt-5-mini";
    vlCandidates = [primary, "gpt-4o-mini", "gpt-4o"];
    const txtPrimary = process.env.LLM_TEXT_MODEL || process.env.OPENAI_TEXT_MODEL || primary;
    textCandidates = [txtPrimary, "gpt-4o-mini"]; // fallback
  } else if (vendor === 'moonshot') {
    const primary = process.env.LLM_VL_MODEL || process.env.MOONSHOT_VL_MODEL || "moonshot-v1-128k-vision-preview";
    vlCandidates = [primary];
    const txtPrimary = process.env.LLM_TEXT_MODEL || process.env.MOONSHOT_TEXT_MODEL || primary;
    textCandidates = [txtPrimary];
  } else {
    vlCandidates = [process.env.LLM_VL_MODEL || process.env.DASHSCOPE_VL_MODEL || "qwen-vl-ocr", "qwen-vl-max"];
    textCandidates = [process.env.LLM_TEXT_MODEL || process.env.DASHSCOPE_TEXT_MODEL || "qwen-plus"];
  }

  async function runOnce(model: string) {
    if (DEBUG) console.log('[LLM]', vendor, 'baseURL', baseURL, 'model', model, 'images', allUrls.length, 'hasApiKey', !!apiKey);
    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      temperature: 0,
    });
    return resp;
  }

  let resp: any = null;
  // Use vision models when there is at least one image URL (either url or urls[])
  const models = (allUrls.length > 0) ? vlCandidates : textCandidates;
  let lastErr: any = null;
  for (const m of models) {
    try {
      resp = await runOnce(m);
      break;
    } catch (e) {
      lastErr = e;
      if (DEBUG) {
        const msg = (e as any)?.message || e;
        const data = (e as any)?.response?.data || (e as any)?.data;
        console.error('[LLM] call failed on', m, msg);
        if (data) console.error('[LLM] response data', JSON.stringify(data).slice(0, 500));
      }
      continue;
    }
  }
  if (!resp) throw lastErr || new Error("qwen call failed");

  const txt = resp.choices?.[0]?.message?.content || "";
  if (DEBUG) console.log('[LLM] raw content length', txt.length);
  const parsed = safeParseJson(txt);
  let checks: AuditCheck[] = Array.isArray(parsed?.checks) ? parsed.checks.map((c: any) => ({ name: String(c?.name || "项"), ok: !!c?.ok, message: c?.message ? String(c.message) : undefined })) : [];
  // Ensure canonical order and presence
  if (checks.length) {
    if (checks.length === CANONICAL_RULES.length) {
      // Map by index order, ignore returned names to avoid mismatch
      checks = CANONICAL_RULES.map((n, i) => ({ name: n, ok: !!checks[i]?.ok, message: checks[i]?.message }));
    } else {
      const byName = new Map(checks.map((c) => [normalize(c.name), c] as const));
      checks = CANONICAL_RULES.map((n) => byName.get(normalize(n)) || { name: n, ok: false, message: "未返回该项" });
    }
  }
  // Enforce consistency for rule #1 based on strict.expected_match_exact and message cues
  try {
    if (checks.length >= 1) {
      const strictMatch = typeof parsed?.strict?.expected_match_exact === 'boolean' ? !!parsed.strict.expected_match_exact : undefined;
      const msg = String(checks[0]?.message || '');
      const msgSuggestsMismatch = /不一致|不相等|不等于|不匹配/.test(msg);
      if (strictMatch === false || msgSuggestsMismatch) {
        checks[0] = { ...checks[0], ok: false };
      }
      if (strictMatch === true && !msgSuggestsMismatch) {
        checks[0] = { ...checks[0], ok: true };
      }
    }
  } catch {}
  const ok = checks.length ? checks.every((c) => c.ok) : false;
  const catRaw = String(parsed?.category || "其他");
  const category = (categories as readonly string[]).includes(catRaw) ? (catRaw as ContractCategory) : "其他";
  const categoryReason = parsed?.category_reason ? String(parsed.category_reason) : undefined;

  const audit: AuditResult = {
    ok,
    checks,
    source: vendor,
    notes: parsed?.notes || (vendor === 'moonshot' ? 'via moonshot' : 'via qwen'),
    recognized: parsed?.recognized,
  };
  return { audit, category };
}

function safeParseJson(s: string): any {
  try {
    // Try direct JSON
    return JSON.parse(s);
  } catch {}
  // Try to locate a JSON block
  const m = s.match(/[\{\[][\s\S]*[\}\]]/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function normalize(s: string): string {
  return String(s)
    .replace(/[\s\d)）(（:：\-_.。,.，]/g, "")
    .trim();
}
