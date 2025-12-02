import { NextRequest } from "next/server";
import { saveContractFromImages, kickOffAudit } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const expectedName = String(form.get("expectedName") || "上海大学材料科学与工程学院");
  const original = String(form.get("originalName") || "contract.pdf");
  const files: File[] = [];
  for (const [k, v] of form.entries()) {
    if (k.startsWith("image_") && v instanceof Blob) files.push(v as File);
  }
  if (files.length === 0) return new Response("缺少图片", { status: 400 });
  const buffers: { filename: string; mime: string; buffer: Buffer }[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i] as any;
    const ab = await (f as Blob).arrayBuffer();
    buffers.push({ filename: f.name || `page-${i + 1}.png`, mime: f.type || "image/png", buffer: Buffer.from(ab) });
  }
  try {
    const saved = await saveContractFromImages({ originalName: original, expectedName, images: buffers });
    // async audit
    kickOffAudit(saved.id).catch(() => {});
    return Response.json({ id: saved.id });
  } catch (e: any) {
    return new Response(e?.message || "上传失败", { status: 500 });
  }
}

