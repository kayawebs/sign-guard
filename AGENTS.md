# Repository Guidelines

## Project Structure & Module Organization
- `app/` — Next.js App Router (e.g., `app/upload/page.tsx`, `app/contracts/[id]/page.tsx`).
- `app/api/` — server routes (e.g., `app/api/audit/route.ts`, `app/api/contracts/[id]/download/route.ts`).
- `components/` — reusable UI (e.g., `UploadDropzone.tsx`, `AuditResultCard.tsx`).
- `lib/` — shared code: `lib/aliyun.ts` (server-only client), `lib/validation.ts` (rules).
- `public/` — static assets (e.g., `icons/check.svg`).
- `tests/` and/or `e2e/` — unit/integration and end-to-end tests.

## Build, Test, and Development Commands
- Install deps: `pnpm install` (use `npm i`/`yarn` if preferred).
- Dev server: `pnpm dev` → `http://localhost:3000`.
- Build/serve: `pnpm build` and `pnpm start`.
- Lint/format: `pnpm lint` and `pnpm format` (ESLint + Prettier).
- Tests: `pnpm test` (unit), `pnpm test:e2e` (Playwright if configured).
- Env: `cp .env.example .env.local` then set Aliyun keys.

## Coding Style & Naming Conventions
- TypeScript strict; React Server Components by default, add `"use client"` when needed.
- Components: PascalCase files; route segments: lowercase; hooks: `useX`.
- Avoid default exports for components; 2-space indent; keep functions small and pure.

## Testing Guidelines
- Unit: Jest + React Testing Library for components; mock Aliyun calls.
- Routes: integration tests for `app/api/*` handlers.
- E2E: Playwright for upload, view, download, and audit flows.
- Name: `*.test.ts(x)`; target ≥80% coverage on `lib/` and API routes.

## Commit & Pull Request Guidelines
- Conventional Commits (e.g., `feat(audit): validate date logic`).
- PRs: describe scope, link issues, add screenshots of error prompts and green-check state; include tests.

## Security & Configuration Tips
- Secrets in `.env.local` only (e.g., `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET`, `ALIYUN_REGION`). Never expose in client bundles.
- Uploads: size limit and MIME whitelist; stream to OSS; downloads via signed URLs.
- Server-only Aliyun calls in `app/api/*` or `lib/server/*`; redact PII in logs; clear error messages for failed audits.

## New Features (Audit + Roles + Classification)
- Heuristic checks in `lib/audit.ts` implement Article 7–8 stamping/signing requirements (keywords-based until real OCR is integrated).
- Contract classification via OCR/text keywords in `lib/classify.ts` into学院分类: 本科教学类/研究生教学类/科研类/人事/劳动类/国际/港澳台交流类/学工类/院团委类/其他.
- Traceability stored in `Contract.history` with actions: upload/audit/manual_review/category_update.
- Manual review API `POST app/api/contracts/[id]/review` and UI on `app/contracts/[id]/page.tsx` to approve/reject/need changes with comment.
- Category update API `POST app/api/contracts/[id]/category` and UI selector on detail page.

## Aliyun OCR
- Preferred env vars (per Alibaba Cloud docs):
  - `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
  - `ALIBABA_CLOUD_REGION` (e.g., `cn-shanghai`)
  - `ALIBABA_CLOUD_OCR_ENDPOINT` (optional; default `ocr.cn-shanghai.aliyuncs.com`)
- Backward-compatible envs: `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET`, `ALIYUN_REGION`, `ALIYUN_ENDPOINT`.
- Install SDK: `pnpm add @alicloud/ocr20191230 @alicloud/openapi-client @alicloud/tea-util`.

## Aliyun OSS Sync (Required)
- Env vars (preferred):
  - `ALIBABA_CLOUD_ACCESS_KEY_ID`, `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
  - `ALIBABA_CLOUD_OSS_BUCKET`
  - optional: `ALIBABA_CLOUD_OSS_REGION` (e.g., `oss-cn-shanghai`) or `ALIBABA_CLOUD_OSS_ENDPOINT` (e.g., `oss-cn-shanghai.aliyuncs.com`)
- Fallback envs: `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET`, `OSS_BUCKET`, `OSS_REGION`, `OSS_ENDPOINT`.
- Install SDK: `pnpm add ali-oss`.
- Implementation: `lib/oss.ts` provides `uploadToOss` and `getOssSignedUrl`.
- Behavior: upload MUST sync to OSS. If OSS is not configured or upload fails, the upload API returns 500 with a clear error. On success, contract stores `ossBucket/ossKey`. The download route prefers redirecting to a short-lived signed URL.
- Implementation: `lib/aliyun.ts` dynamically tries available OCR SDKs and methods; falls back to local extraction if not available or errors.

## Qwen LLM (DashScope) Integration
- Purpose: Unified OCR + rule checks + classification via LLM.
- Env vars:
  - `DASHSCOPE_API_KEY` (required)
  - Optional: `DASHSCOPE_BASE_URL` (default `https://dashscope.aliyuncs.com/compatible-mode/v1`)
  - Optional: `DASHSCOPE_VL_MODEL` (default `qwen-vl-ocr`, fallback `qwen-vl-max`), `DASHSCOPE_TEXT_MODEL` (default `qwen-plus`)
- Implementation:
  - `lib/llm.ts` provides `hasDashscope()` and `analyzeWithQwen({ url, expectedName, mime, textHint })`.
  - Storage prefers LLM when OSS URL is available; otherwise falls back to Aliyun OCR/local heuristics.
- Behavior:
  - Upload syncs to OSS (required), then audit/classify via Qwen using a short-lived signed URL.
  - The LLM returns structured JSON: ok/checks/category; we map to `AuditResult` and set `Contract.category`.

## Fixed Classification Standard
- Canonical categories and their descriptions are defined in `lib/categories.ts` and must be used across the system:
  - 本科教学类 / 研究生教学类 / 科研类 / 人事/劳动类 / 国际/港澳台交流类 / 学工类 / 院团委类 / 其他
- LLM prompt enumerates these categories and descriptions, and we validate outputs to this set.
- Heuristic fallback classifier `lib/classify.ts` uses the same category definitions and keywords.

## 标准署名输入
- 上传页新增“标准署名”输入，默认“上海大学材料科学与工程学院”。
- 审核新增“标准署名匹配”检查；合同详情页展示该值。
