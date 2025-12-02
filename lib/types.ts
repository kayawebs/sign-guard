export type AuditCheck = {
  name: string;
  ok: boolean;
  message?: string;
};

export type AuditResult = {
  ok: boolean;
  checks: AuditCheck[];
  source?: string; // e.g., moonshot|openai|dashscope|local
  notes?: string;
  recognized?: {
    seals?: Array<{ side?: string; imprint_text?: string; near_text?: string | null }>;
    signatures?: Array<{ side?: string; name?: string | null; label?: string | null }>;
  };
};

export type Contract = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  path: string; // absolute or repo-relative storage path
  createdAt: string; // ISO
  audit?: AuditResult;
  category?: ContractCategory;
  categoryReason?: string;
  manualReview?: ManualReview;
  history?: AuditTrail[];
  expectedImprintName?: string; // 标准署名要求
  // OSS sync info (if configured)
  ossBucket?: string;
  ossRegion?: string;
  ossEndpoint?: string;
  ossKey?: string;
  images?: string[]; // Converted page identifiers: either OSS object keys (preferred) or absolute URLs
};

export type ContractCategory =
  | "本科教学类"
  | "研究生教学类"
  | "科研类"
  | "人事/劳动类"
  | "国际/港澳台交流类"
  | "学工类"
  | "院团委类"
  | "其他";

export type ManualReview = {
  status: "approved" | "rejected" | "needs_changes";
  comment?: string;
  reviewer?: string; // optional until auth is added
  reviewedAt: string; // ISO
};

export type AuditTrail = {
  at: string; // ISO
  action:
    | "upload"
    | "audit"
    | "manual_review"
    | "category_update"
    | "oss_sync"
    | "pdf_convert";
  meta?: Record<string, unknown>;
};
