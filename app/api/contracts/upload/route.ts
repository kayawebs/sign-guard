import { NextRequest } from "next/server";
import { saveContract, saveContractFromImages, kickOffAudit } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("file");
  const expectedName = String(form.get("expectedName") || "上海大学材料科学与工程学院");
  if (!files || files.length === 0) {
    return new Response("缺少文件", { status: 400 });
  }
  // If multiple images, treat as multi-page; else single file
  // Be tolerant of runtime differences: narrow to File-like entries by presence of arrayBuffer()
  const blobs = (files as any[]).filter((f) => f && typeof f === 'object' && typeof (f as any).arrayBuffer === 'function') as File[];
  const images = blobs.filter((b: any) => (b?.type || '').startsWith("image/"));
  try {
    if (images.length > 1) {
      // multi-image contract
      const imgs = await Promise.all(images.map(async (b, idx) => {
        const ab = await b.arrayBuffer();
        return { filename: (b as any).name || `page-${idx + 1}.png`, mime: (b as any).type || "image/png", buffer: Buffer.from(ab) };
      }));
      const name = (images[0] as any).name || "contract-images";
      const saved = await saveContractFromImages({ originalName: name, expectedName, images: imgs });
      kickOffAudit(saved.id).catch(() => {});
      return Response.json({ id: saved.id });
    } else {
      const file = blobs[0] as any;
      const filename: string = file?.name || "contract";
      const mime: string = file?.type || "application/octet-stream";
      const ab = await (file as Blob).arrayBuffer();
      const buf = Buffer.from(ab);
      const saved = await saveContract({ filename, mime, buffer: buf, expectedName });
      kickOffAudit(saved.id).catch(() => {});
      return Response.json({ id: saved.id });
    }
  } catch (e: any) {
    const msg = e?.message || "上传失败";
    return new Response(msg, { status: 500 });
  }
}
