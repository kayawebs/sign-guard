import { NextRequest } from "next/server";
import { getContractById, getContractFileStream } from "@/lib/storage";
import { getOssSignedUrl } from "@/lib/oss";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const item = await getContractById(params.id);
  if (!item) return new Response("Not found", { status: 404 });
  const { searchParams } = new URL(req.url);
  const embed = searchParams.get("embed");
  // Prefer OSS signed URL if available
  if (item.ossBucket && item.ossKey) {
    const url = await getOssSignedUrl({ bucket: item.ossBucket, region: item.ossRegion, endpoint: item.ossEndpoint, key: item.ossKey }, {});
    if (url) {
      if (embed) {
        // Proxy the content to avoid top-level redirect during embed
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) return new Response("Upstream error", { status: 502 });
        return new Response(resp.body as any, {
          headers: {
            "Content-Type": item.mime || resp.headers.get("content-type") || "application/octet-stream",
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }
      return new Response(null, { status: 302, headers: { Location: url } });
    }
  }
  const stream = await getContractFileStream(item);
  if (!stream) return new Response("File missing", { status: 404 });
  return new Response(stream as any, {
    headers: {
      "Content-Type": item.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(item.filename)}"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
