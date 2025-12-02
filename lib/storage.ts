import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { classifyContract } from "./classify";
import { hasOssConfig, uploadToOss, getOssSignedUrl } from "./oss";
import { hasLLM, analyzeWithQwen } from "./llm";
import { CANONICAL_RULES } from "./rules";
import type { Contract, ContractCategory, ManualReview, AuditTrail } from "./types";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "var", "data");
const FILE_DIR = path.join(ROOT, "var", "storage", "contracts");
const DB_PATH = path.join(DATA_DIR, "contracts.json");

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(FILE_DIR, { recursive: true });
  if (!fss.existsSync(DB_PATH)) {
    await fs.writeFile(DB_PATH, JSON.stringify({ items: [] }, null, 2));
  }
}

async function loadAll(): Promise<Contract[]> {
  await ensureDirs();
  const raw = await fs.readFile(DB_PATH, "utf8");
  const json = JSON.parse(raw) as { items: Contract[] };
  return json.items;
}

async function saveAll(items: Contract[]) {
  await ensureDirs();
  await fs.writeFile(DB_PATH, JSON.stringify({ items }, null, 2));
}

// Heuristic merge/normalization removed: keep Moonshot outputs as-is.

function makeLLMFailureAudit(note: string) {
  return {
    ok: false,
    checks: [
      { name: "合同主体名称必须正确、完整。", ok: false, message: note },
      { name: "若合同已有对方盖章，则合同文本中的对方名称必须与印章印文一致。", ok: false, message: note },
      { name: "对方已盖章且多页或有附件，应加盖骑缝章。", ok: false, message: note },
      { name: "禁止在空白文本或未成文载体上盖对方印章。", ok: false, message: note },
      { name: "对方签章必须齐全，包括对方印章（如需盖章）和对方签名/授权人签字。", ok: false, message: note },
      { name: "合同签署日期必须存在（若盖章则应在邻近标注日期）。", ok: false, message: note },
      { name: "对方主体名称、签名栏信息和印章印文需一致。", ok: false, message: note },
    ],
    source: 'aliyun',
    notes: note,
  } as any;
}

export async function listContracts(): Promise<Contract[]> {
  const items = await loadAll();
  return items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function getContractById(id: string): Promise<Contract | undefined> {
  const items = await loadAll();
  return items.find((x) => x.id === id);
}

export async function saveContract({ filename, mime, buffer, expectedName }:
  { filename: string; mime: string; buffer: Buffer; expectedName?: string; }): Promise<Contract> {
  await ensureDirs();
  const id = crypto.randomUUID();
  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  const filePath = path.join(FILE_DIR, `${id}-${safeName}`);
  await fs.writeFile(filePath, buffer);

  const item: Contract = {
    id,
    filename,
    mime,
    size: buffer.length,
    path: filePath,
    createdAt: new Date().toISOString(),
    history: [],
    expectedImprintName: expectedName || "上海大学材料科学与工程学院",
  };

  // Enforce OSS sync: must be configured and succeed
  if (!hasOssConfig()) {
    // cleanup local file
    try { await fs.unlink(filePath); } catch {}
    throw new Error("OSS 未配置：请设置 ALIBABA_CLOUD_OSS_BUCKET 和相关凭据");
  }
  const oss = await uploadToOss({ id, filename, mime, buffer });
  if (!oss) {
    try { await fs.unlink(filePath); } catch {}
    throw new Error("OSS 同步失败，请稍后重试");
  }
  item.ossBucket = oss.ossBucket;
  item.ossRegion = oss.ossRegion;
  item.ossEndpoint = oss.ossEndpoint;
  item.ossKey = oss.ossKey;
  item.history?.push({ at: new Date().toISOString(), action: "oss_sync", meta: { bucket: oss.ossBucket, key: oss.ossKey } });

  // PDF 转图片流程（阿里云 DocMind）已移除。PDF预览与审核将基于原文件或前端展示。

  const items = await loadAll();
  items.push(item);
  await saveAll(items);

  return item;
}

export async function saveContractFromImages({ originalName, expectedName, images }:
  { originalName: string; expectedName?: string; images: { filename: string; mime: string; buffer: Buffer }[] }): Promise<Contract> {
  await ensureDirs();
  const id = crypto.randomUUID();
  const safeName = originalName.replace(/[^\w.\-]+/g, "_");
  const filePath = path.join(FILE_DIR, `${id}-${safeName}`);
  await fs.writeFile(filePath, Buffer.from("PDF converted to images"));

  const item: Contract = {
    id,
    filename: originalName,
    mime: images[0]?.mime || "image/png",
    size: images.reduce((s, im) => s + im.buffer.length, 0),
    path: filePath,
    createdAt: new Date().toISOString(),
    history: [],
    expectedImprintName: expectedName || "上海大学材料科学与工程学院",
    images: [],
  };

  if (!hasOssConfig()) {
    try { await fs.unlink(filePath); } catch {}
    throw new Error("OSS 未配置：请设置 ALIBABA_CLOUD_OSS_BUCKET 和相关凭据");
  }
  const items = await loadAll();
  items.push(item);
  await saveAll(items);

  // upload images to OSS as contracts/{id}-page-{n}.png
  let idx = 0;
  for (const im of images) {
    idx++;
    const keyName = `${id}-page-${idx}.png`;
    const uploaded = await uploadToOss({ id, filename: keyName, mime: im.mime || "image/png", buffer: im.buffer });
    if (uploaded?.ossKey) {
      item.images!.push(uploaded.ossKey);
      // Ensure bucket/region/endpoint stored for later signing of per-page images
      if (!item.ossBucket && uploaded.ossBucket) item.ossBucket = uploaded.ossBucket;
      if (!item.ossRegion && uploaded.ossRegion) item.ossRegion = uploaded.ossRegion;
      if (!item.ossEndpoint && uploaded.ossEndpoint) item.ossEndpoint = uploaded.ossEndpoint;
    }
  }
  item.history?.push({ at: new Date().toISOString(), action: "oss_sync", meta: { pages: item.images?.length || 0 } });
  await saveAll(items);
  return item;
}

export async function saveContractAndAudit({ filename, mime, buffer, expectedName }:
  { filename: string; mime: string; buffer: Buffer; expectedName?: string; }): Promise<Contract> {
  const item = await saveContract({ filename, mime, buffer, expectedName });
  const { id, path: filePath } = item;
  // Run audit/classify: prefer Qwen LLM if configured and we have OSS URL
  let auditRes: any = null;
  let clsRes: any = null;
  if (hasLLM() && item.ossBucket && item.ossKey) {
    const url = await (await import('./oss')).getOssSignedUrl({ bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey }, { expiresSec: 300 });
    try {
      // 不做PDF转图；若是图片则直接传单图；PDF传原始URL（若模型不支持则回退启发式）
      const { audit, category } = await analyzeWithQwen({ url: url || undefined, expectedName: item.expectedImprintName, mime });
      // Also compute heuristic to enrich messages
      const heur = await auditContract(filePath, { id, expectedName: item.expectedImprintName, oss: { bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey } });
      auditRes = mergeAudit(audit, heur);
      auditRes = normalizeRecognized(auditRes, item.expectedImprintName);
      if (category) item.category = category;
    } catch {
      auditRes = await auditContract(filePath, { id, expectedName: item.expectedImprintName, oss: { bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey } });
      clsRes = await classifyContract(filePath);
      item.category = clsRes.category;
    }
  } else {
    auditRes = await auditContract(filePath, { id, expectedName: item.expectedImprintName, oss: { bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey } });
    clsRes = await classifyContract(filePath);
    item.category = clsRes.category;
  }
  // If LLM returned incomplete checks, merge with heuristic canonical checks
  if (auditRes && Array.isArray(auditRes.checks)) {
    const missingAll = auditRes.checks.every((c: any) => !c || String(c.message || '').includes('未返回该项'));
    if (missingAll) {
      const heur = await auditContract(filePath, { id, expectedName: item.expectedImprintName, oss: { bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey } });
      auditRes = heur;
    }
  }
  // assign audit
  if (auditRes) item.audit = auditRes;
  // Traceability
  item.history?.push(
    { at: item.createdAt, action: "upload", meta: { filename, mime, size: buffer.length } },
    { at: new Date().toISOString(), action: "audit", meta: { ok: item.audit?.ok, source: item.audit?.source } },
    { at: new Date().toISOString(), action: "category_update", meta: { category: item.category } },
  );
  await saveAll(items);
  return item;
}

export async function auditById(id: string): Promise<boolean> {
  const items = await loadAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const item = items[idx];
  if (hasLLM() && (item.ossBucket && (item.ossKey || (item.images && item.images.length)))) {
    const url = await (await import('./oss')).getOssSignedUrl({ bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey }, { expiresSec: 300 });
    try {
      // Build multi-page signed URLs if available
      let urls: string[] | undefined = undefined;
      let pagesHint = '';
      if (item.images && item.images.length) {
        urls = [];
        for (const ref of item.images) {
          if (/^https?:\/\//i.test(ref)) urls.push(ref);
          else {
            const u = await (await import('./oss')).getOssSignedUrl({ bucket: item.ossBucket!, region: item.ossRegion, endpoint: item.ossEndpoint, key: ref }, { expiresSec: 300 });
            if (u) urls.push(u);
          }
        }
        pagesHint = `本次输入页数: ${urls.length}。若页数为1，骑缝章检查应判定为不适用。`;
      } else if (url) {
        pagesHint = '本次输入页数: 1。若页数为1，骑缝章检查应判定为不适用。';
      }
      const { audit, category } = await analyzeWithQwen({ url: urls ? undefined : (url || undefined), urls, expectedName: item.expectedImprintName, mime: item.mime, textHint: pagesHint });
      items[idx] = { ...item, audit, category: category || item.category };
      await saveAll(items);
      return true;
    } catch {
      // No heuristic fallback. Keep blank checks to unblock UI polling.
      const placeholder = { ok: false, checks: CANONICAL_RULES.map((n) => ({ name: n, ok: false })), source: 'moonshot' } satisfies any;
      const now = new Date().toISOString();
      const history = [...(item.history ?? []), { at: now, action: "audit", meta: { ok: false, source: 'moonshot' } } satisfies AuditTrail];
      items[idx] = { ...item, audit: placeholder, history };
      await saveAll(items);
      return true;
    }
  }
  // No LLM or no OSS: leave blank audit
  const now = new Date().toISOString();
  const history = [...(item.history ?? []), { at: now, action: "audit", meta: { ok: false, source: 'local' } } satisfies AuditTrail];
  const blank = { ok: false, checks: CANONICAL_RULES.map((n) => ({ name: n, ok: false })), source: 'local' } satisfies any;
  items[idx] = { ...item, audit: blank, history };
  await saveAll(items);
  return true;
}

export async function kickOffAudit(id: string): Promise<void> {
  try { await auditById(id); } catch {}
}

export async function getContractFileStream(item: Contract) {
  try {
    await fs.access(item.path);
    return fss.createReadStream(item.path);
  } catch {
    return null;
  }
}

export async function deleteContract(id: string): Promise<boolean> {
  const items = await loadAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const item = items[idx];
  // Remove file if exists
  try { await fs.unlink(item.path); } catch {}
  items.splice(idx, 1);
  await saveAll(items);
  return true;
}

export async function updateCategory(id: string, category: ContractCategory) {
  const items = await loadAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const item = items[idx];
  const now = new Date().toISOString();
  const history = [...(item.history ?? []), { at: now, action: "category_update", meta: { category } } as AuditTrail];
  items[idx] = { ...item, category, history };
  await saveAll(items);
  return true;
}

export async function setManualReview(id: string, review: ManualReview) {
  const items = await loadAll();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  const item = items[idx];
  const history = [...(item.history ?? []), { at: review.reviewedAt, action: "manual_review", meta: { status: review.status } } as AuditTrail];
  items[idx] = { ...item, manualReview: review, history };
  await saveAll(items);
  return true;
}
