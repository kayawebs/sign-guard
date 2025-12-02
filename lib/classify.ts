import fs from "node:fs/promises";
import { extractText } from "./text";
import type { ContractCategory } from "./types";
import { CATEGORY_DEFS } from "./categories";

export async function classifyContract(filePath: string): Promise<{ category: ContractCategory; source: "local" | "aliyun"; reason?: string; }>{
  const buf = await fs.readFile(filePath);
  const text = await extractText(filePath, buf);

  // Simple keyword-based classification using fixed category definitions
  const T = (s: string) => text.includes(s);
  for (const def of CATEGORY_DEFS) {
    if (def.name === "其他") continue;
    if (def.keywords.some((k) => T(k))) {
      return { category: def.name, source: "local", reason: `命中关键词: ${def.keywords.filter(T).join("/")}` };
    }
  }
  return { category: "其他", source: "local" };
}
