import fs from "node:fs/promises";
import path from "node:path";

export async function extractText(filePath: string, buf?: Buffer): Promise<string> {
  const data = buf ?? (await fs.readFile(filePath));
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt") return data.toString("utf8");
  try {
    const s = data.toString("utf8");
    const replacementCount = (s.match(/\uFFFD/g) || []).length;
    if (replacementCount / Math.max(1, s.length) > 0.01) return "";
    return s;
  } catch {
    return "";
  }
}

