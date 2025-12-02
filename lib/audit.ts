import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import type { AuditResult, AuditCheck } from "./types";
import { CANONICAL_RULES } from "./rules";
import { extractText } from "./text";
// Aliyun OCR removed; keep only heuristics/local extraction.
import { getOssSignedUrl } from "./oss";

// Very lightweight local heuristics as a fallback when Aliyun is not configured.
// Real OCR/semantics should be implemented by calling Aliyun services.

function envHasAliyun(): boolean { return false; }

export async function auditContract(filePath: string, opts?: { id?: string; expectedName?: string; oss?: { bucket?: string; region?: string; endpoint?: string; key?: string } }): Promise<AuditResult> {
  let text = "";
  let source: "aliyun" | "local" = "local";
  let ocrData: any | null = null;
  if (!text) {
    const buf = await fs.readFile(filePath);
    text = await extractText(filePath, buf);
  }

  // Pre-normalization for terminology variations
  // 甲方=需方，乙方=供方（按用户要求）
  const partyAAliases = (process.env.AUDIT_PARTY_A_ALIASES || "甲方,需方,买方").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const partyBAliases = (process.env.AUDIT_PARTY_B_ALIASES || "乙方,供方,卖方").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const sealAliases = (process.env.AUDIT_SEAL_ALIASES || "落款,盖章,公章,合同章,印章,专用章").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const signatureAliases = (process.env.AUDIT_SIGNATURE_ALIASES || "签名,签字,签章,签署").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const sewnAliases = (process.env.AUDIT_SEWN_ALIASES || "骑缝,骑缝章,骑缝印").split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const approvalAliases = (process.env.AUDIT_APPROVAL_ALIASES || "审批,审批表,流程,批复,批准,同意").split(/[,，]/).map((s) => s.trim()).filter(Boolean);

  // Canonicalize a soft version for matching while keeping original text for messages
  const canonical = text
    .replace(/供方/g, "甲方")
    .replace(/需方/g, "乙方");

  const checks: AuditCheck[] = [];

  // 1) 时间格式: 兼容 2025-11-20 / 2025.11.20 / 2025/11/20 / 2025年11月20日
  const dateRegex = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})(日)?/g;
  const dates = Array.from(canonical.matchAll(dateRegex)).map((m) => `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  checks.push({ name: "时间格式(多样式)", ok: dates.length > 0, message: dates.length ? `发现 ${dates.length} 处日期` : "未检测到日期" });

  // 2) 时间逻辑: 取首个两个日期进行开始<=结束判断
  let timeLogicOk = true;
  if (dates.length >= 2) {
    const [d1, d2] = dates;
    const t1 = Date.parse(d1);
    const t2 = Date.parse(d2);
    timeLogicOk = !isNaN(t1) && !isNaN(t2) && t1 <= t2;
    checks.push({ name: "时间逻辑(开始≤结束)", ok: timeLogicOk, message: `${d1 ?? "?"} → ${d2 ?? "?"}` });
  } else {
    checks.push({ name: "时间逻辑(开始≤结束)", ok: false, message: "未找到可比较的日期" });
  }

  // 3) 甲乙方是否存在
  const hasA = new RegExp(`(${partyAAliases.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(text);
  const hasB = new RegExp(`(${partyBAliases.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(text);
  checks.push({ name: "主体(甲/乙/供/需等)存在", ok: hasA && hasB, message: `${hasA ? "已识别甲/供/买/发等" : "缺少甲/供等"}，${hasB ? "已识别乙/需/卖/承等" : "缺少乙/需等"}` });

  // 4) 签名是否存在 (关键词启发式)
  const hasSignature = new RegExp(`(${signatureAliases.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(text);
  checks.push({ name: "签名是否存在", ok: hasSignature, message: hasSignature ? "检测到签名相关字样" : "未检测到签名字样" });

  // 5) 落款是否正确 (检查是否出现“落款|盖章|公章|合同章”) 
  let hasSeal = new RegExp(`(${sealAliases.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(text);
  checks.push({ name: "落款/盖章是否存在", ok: hasSeal, message: hasSeal ? "检测到落款/盖章字样" : "未检测到相关字样" });

  // 6) 学院印章规则（启发式，第七条）
  const mentionsCollegeSeal = /(学院).*?(印章|公章|合同章|专用章)/.test(text);
  checks.push({ name: "学院印章字样", ok: mentionsCollegeSeal, message: mentionsCollegeSeal ? "检测到学院与印章相关字样" : "未检测到学院印章字样" });

  const mentionsSewnSeal = new RegExp(`(${sewnAliases.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`).test(text);
  // Attachment detection: positive vs negative patterns
  const attachPositive = /(附件[：:][^\n/]{1,40})/;
  const attachNegative = /(附件[：:]\s*[\/]|无附件)/;
  const mentionsAttachment = attachPositive.test(text) && !attachNegative.test(text);
  // 若提及多页或附件但未提及骑缝章，则提示
  const mentionsMultipage = /(共\s*\d+\s*页|多页|第\s*\d+\s*页)/.test(text);
  const sewnSealOk = !(mentionsAttachment || mentionsMultipage) || mentionsSewnSeal;
  checks.push({ name: "多页/附件骑缝章", ok: sewnSealOk, message: sewnSealOk ? "满足启发式检查" : "提及多页/附件但未检测到骑缝章" });

  // 盖章前置条件：对方先盖章 + 承办人签字 + 备案经费卡
  const counterpartStamped = /(对方)[\s\S]*?(盖章|签章|印章|专用章)/.test(text) || new RegExp(`(${partyBAliases.join("|")})[\\s\\S]*?(盖章|签章|印章|专用章)`).test(text);
  const handlerSigned = /(承办人|经费卡负责人).*(签字|签名|签署)/.test(text);
  const recordWithFund = /(备案).*(经费卡|经费卡号)/.test(text);
  const preSealOk = counterpartStamped && handlerSigned && (recordWithFund || !/经费卡/.test(text));
  checks.push({ name: "盖章前置(对方章/承办人/经费卡)", ok: preSealOk, message: `${counterpartStamped ? "对方章✓" : "对方章✗"} ${handlerSigned ? "承办人✓" : "承办人✗"} ${recordWithFund ? "经费卡✓" : "经费卡?"}` });

  // 审批流程提示：若出现学院盖章相关而未检测到审批字样，则提示
  const mentionsSealApply = /(学院).*?(印章|公章)|盖学院章/.test(text) || hasSeal;
  const mentionsApproval = /(审批|审批表|流程|同意|批准)/.test(text);
  const approvalOk = !mentionsSealApply || mentionsApproval;
  checks.push({ name: "按制度完成审批再盖章", ok: approvalOk, message: approvalOk ? "包含审批相关字样或未涉及盖章" : "涉及盖章但未检测到审批字样" });

  // 禁止空白盖章提示（若出现“空白”与“盖章”）
  const warnsBlankSeal = /(空白).*(盖章|签章|印章)/.test(text);
  checks.push({ name: "严禁空白文本盖章提示", ok: !warnsBlankSeal, message: warnsBlankSeal ? "疑似出现空白盖章相关语句" : "未发现空白盖章风险字样" });

  // 各方主体一致 + 日期签署（第八条，启发式）
  function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function extractNameByAliases(raw: string, aliases: string[]): string | undefined {
    const re = new RegExp(`(?:${aliases.map(escapeRe).join("|")})[：:，,]?\s*([\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-]{2,})`);
    const m = raw.match(re);
    return (m && m[1]) || undefined;
  }
  const partyAName = extractNameByAliases(text, partyAAliases);
  const partyBName = extractNameByAliases(text, partyBAliases);
  const imprintNames = Array.from(text.matchAll(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{2,})(学院)?(公章|合同章|印章|专用章)/g)).map((m) => m[1]);
  if (!hasSeal && imprintNames.length) hasSeal = true;
  function normCN(s: string) {
    return String(s)
      .replace(/\s+/g, "")
      .replace(/[，,。.．、·・]/g, "")
      .replace(/[（）()]/g, "")
      .replace(/\-/g, "")
      .replace(/于/g, "与");
  }
  let namesConsistencyOk = true;
  if (partyAName || partyBName) {
    const targets = [partyAName, partyBName].filter(Boolean).map(normCN) as string[];
    namesConsistencyOk = targets.every((nm) => imprintNames.some((x) => x && normCN(x).includes(nm)));
  }
  checks.push({ name: "主体名称与印章一致(启发式)", ok: namesConsistencyOk, message: namesConsistencyOk ? "主体与印章大致一致" : "未能匹配主体与印章名称" });

  // 盖章时签署日期：若出现盖章/签署字样且未检测到日期 -> 警示
  const mentionsSignOrSeal = /(签署|签字|签名|盖章|签章|印章)/.test(text);
  const hasAnyDate = dates.length > 0 || /日期|签署日期/.test(text);
  // Neighbor-window analysis with OCR tokens
  let neighborDateOk: boolean | null = null;
  let neighborImprintOk: boolean | null = null;
  const expectedName = (opts?.expectedName || "上海大学材料科学与工程学院").trim();
  try {
    const words: Array<{ word: string }> = (ocrData && (ocrData.prism_wordsInfo || ocrData.prism_wordsInfo)) || [];
    if (Array.isArray(words) && words.length) {
      const W = Number(process.env.AUDIT_NEIGHBOR_WINDOW || 12);
      const tokens = words.map((w) => String(w.word || ""));
      const sigRe = new RegExp(`(${signatureAliases.concat(sealAliases).map(escapeRe).join("|")})`);
      const dateRe = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})(日)?/;
      let hitDate = false;
      for (let i = 0; i < tokens.length; i++) {
        if (!sigRe.test(tokens[i])) continue;
        const start = Math.max(0, i - W);
        const end = Math.min(tokens.length, i + W + 1);
        const windowText = tokens.slice(start, end).join("");
        if (dateRe.test(windowText) || /日期|签署日期/.test(windowText)) { hitDate = true; break; }
      }
      neighborDateOk = !mentionsSignOrSeal || hitDate;

      // Imprint neighbor vs party names/expected name
      const imprintRe = /(公章|合同章|印章|专用章)/;
      const targets = [expectedName, partyAName, partyBName].filter(Boolean) as string[];
      let hitImprint = false;
      for (let i = 0; i < tokens.length; i++) {
        if (!imprintRe.test(tokens[i])) continue;
        const start = Math.max(0, i - W);
        const end = Math.min(tokens.length, i + W + 1);
        const windowText = tokens.slice(start, end).join("");
        if (targets.some((nm) => windowText.includes(nm!))) { hitImprint = true; break; }
      }
      neighborImprintOk = !targets.length || hitImprint;
    }
  } catch {}

  const dateAlongSealOk = neighborDateOk ?? (!mentionsSignOrSeal || hasAnyDate);
  checks.push({ name: "签署/盖章邻近日期", ok: dateAlongSealOk, message: dateAlongSealOk ? "邻近检测到日期或未涉及签署" : "涉及签署/盖章但邻近缺少日期" });

  if (neighborImprintOk !== null) {
    checks.push({ name: "印章邻近主体/标准署名", ok: !!neighborImprintOk, message: neighborImprintOk ? "邻近检测到主体/标准署名" : "印章附近未匹配主体/标准署名" });
  }

  // 7) 标准署名检查（合同必须包含指定署名/印章名称）
  const expected = expectedName;
  const hasExpectedStrict = expected ? new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text) : true;
  const hasExpectedLoose = expected ? normCN(text).includes(normCN(expected)) : true;
  const hasExpected = hasExpectedStrict || hasExpectedLoose;
  checks.push({ name: "标准署名匹配", ok: hasExpected, message: expected ? `要求: ${expected}${hasExpectedStrict ? "(严格)" : hasExpected ? "(宽松)" : ""}` : undefined });

  // Build canonical rule checklist
  const ruleMap: Record<string, AuditCheck> = {};
  function setRule(name: string, ok: boolean, message: string) { ruleMap[name] = { name, ok, message }; }

  // 1) 主体名称正确完整（严格：存在甲/需与乙/供的单位名，且我方名称与标准署名严格一致）
  const nameAOk = !!partyAName && partyAName.length >= 2;
  const nameBOk = !!partyBName && partyBName.length >= 2;
  const expectedStrictOk = hasExpectedStrict; // 我方=标准署名严格匹配
  setRule(
    CANONICAL_RULES[0],
    nameAOk && nameBOk && expectedStrictOk,
    `${nameAOk ? "甲/需有名" : "缺甲/需名"}；${nameBOk ? "乙/供有名" : "缺乙/供名"}；${expectedStrictOk ? "我方=标准署名(严格)" : "我方≠标准署名"}`
  );

  // 2) 对方盖章→名称与印文一致（启发式：若有印章且提取到印章名称集合，与任一主体名匹配）
  const counterpartyName = ((): string | undefined => {
    // 我方=甲方(需方) -> 对方=乙方(供方)
    const expectedName = (opts?.expectedName || "上海大学材料科学与工程学院").trim();
    const eq = (a?: string) => !!a && (a === expectedName || a.includes(expectedName) || expectedName.includes(a));
    const myIsA = eq(partyAName);
    const myIsB = !myIsA && eq(partyBName);
    if (myIsA) return partyBName;
    if (myIsB) return partyAName;
    // 无法判断时默认我方=甲方(需方)，对方=乙方(供方)
    return partyBName || partyAName;
  })();
  const oppSealNameConsistent = hasSeal ? (counterpartyName ? imprintNames.some((x) => normCN(x).includes(normCN(counterpartyName!))) : imprintNames.length > 0) : true;
  setRule(CANONICAL_RULES[1], oppSealNameConsistent, hasSeal ? (oppSealNameConsistent ? "印文与对方名称一致或可近似" : "印文未匹配对方名称") : "未检测对方盖章")

  // 3) 对方已盖章且多页或有附件→骑缝章
  let rule3Ok = true;
  let rule3Msg = "不适用（单页/无附件）";
  if (hasSeal || counterpartStamped) {
    if (mentionsMultipage || mentionsAttachment) {
      rule3Ok = mentionsSewnSeal;
      rule3Msg = rule3Ok ? "已检测到骑缝章" : "多页/附件+盖章但缺骑缝章";
    }
  }
  setRule(CANONICAL_RULES[2], rule3Ok, rule3Msg);

  // 4) 禁止空白文本盖章
  setRule(CANONICAL_RULES[3], !warnsBlankSeal, !warnsBlankSeal ? "未发现空白盖章风险" : "疑似空白盖章表述");

  // 5) 对方签章齐全（印章+签名/授权），以我方=标准署名为立场
  const hasAuth = /(授权|委托)/.test(text);
  function normSide(s: string) { return s.replace(/\s+/g, "").replace(/[，,。.．、·・]/g, "").replace(/[（）()]/g, "").replace(/于/g, "与"); }
  const normExpected = normSide(expected);
  const myIsA = partyAName ? (normSide(partyAName).includes(normExpected) || normExpected.includes(normSide(partyAName))) : false;
  const myIsB = !myIsA && partyBName ? (normSide(partyBName).includes(normExpected) || normExpected.includes(normSide(partyBName))) : false;
  const otherAliases = myIsA ? partyBAliases : myIsB ? partyAAliases : partyBAliases;
  const aliasGroup = otherAliases.length ? `(?:${otherAliases.map(escapeRe).join("|")})` : "对方";
  // Allow across newlines
  const otherSigRe = new RegExp(`${aliasGroup}[\s\S]{0,120}(委托代理人|经办人|签字|签名|签署)`);
  const otherAuthRe = new RegExp(`${aliasGroup}[\s\S]{0,160}(授权|委托)`);
  const otherSealRe = new RegExp(`${aliasGroup}[\s\S]{0,160}(公章|合同章|印章|专用章)`);
  const otherSignatureNearby = otherSigRe.test(text);
  const otherAuthNearby = otherAuthRe.test(text);
  const otherSealNearby = otherSealRe.test(text) || imprintNames.some((nm) => (myIsA && partyBName ? nm.includes(partyBName) : myIsB && partyAName ? nm.includes(partyAName) : false));
  const genericAgentPresent = /(委托代理人|经办人)/.test(text);

  let rule5Ok = true;
  let rule5Msg = "签章齐全";
  if (hasSeal || counterpartStamped) {
    rule5Ok = otherSealNearby && (otherSignatureNearby || otherAuthNearby || genericAgentPresent);
    rule5Msg = rule5Ok ? "对方印章+签名/授权齐全" : "缺对方印章或签名/授权";
  } else {
    rule5Ok = otherSignatureNearby || otherAuthNearby || genericAgentPresent;
    rule5Msg = rule5Ok ? "对方签名/授权存在" : "缺对方签名/授权";
  }
  setRule(CANONICAL_RULES[4], rule5Ok, rule5Msg);

  // 6) 签署日期必须存在（若盖章则应邻近有日期）
  const hasDateGlobal = dates.length > 0 || /签署日期|日期/.test(text);
  const rule6bOk = hasDateGlobal && (!mentionsSignOrSeal || dateAlongSealOk);
  setRule(CANONICAL_RULES[5], rule6bOk, rule6bOk ? (dates[0] ? `检测到日期(${dates[0]})` : "检测到签署日期字样/邻近日期") : "未检测到签署日期或盖章邻近无日期");

  // 7) 对方主体名称、签名栏信息和印章印文需一致（启发式合并）
  const rule9Ok = namesConsistencyOk && (neighborImprintOk ?? true);
  setRule(CANONICAL_RULES[6], rule9Ok, rule9Ok ? "主体/签名/印章一致或近似" : "主体/签名/印章未能匹配");

  const finalChecks = CANONICAL_RULES.map((n) => ruleMap[n]);
  const ok = finalChecks.every((c) => c.ok);
  return {
    ok,
    checks: finalChecks,
    source,
    notes: source === "aliyun" ? "OCR: Aliyun 结果，含启发式校验" : "未使用OCR或OCR失败，采用本地启发式文本分析",
  };
}
