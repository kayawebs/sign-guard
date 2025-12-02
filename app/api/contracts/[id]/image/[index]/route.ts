import { NextRequest } from "next/server";
import { getContractById } from "@/lib/storage";
import { getOssSignedUrl } from "@/lib/oss";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string; index: string } }) {
  const item = await getContractById(params.id);
  if (!item) return new Response("Not found", { status: 404 });
  const idx = parseInt(params.index, 10);
  const ref = item.images?.[idx];
  if (!ref) return new Response("Not found", { status: 404 });
  const isUrl = /^https?:\/\//i.test(ref);
  const url = isUrl ? ref : await getOssSignedUrl({ bucket: item.ossBucket!, region: item.ossRegion, endpoint: item.ossEndpoint, key: ref }, {});
  if (!url) return new Response("Upstream error", { status: 502 });
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) return new Response("Upstream error", { status: 502 });
  return new Response(resp.body as any, {
    headers: {
      "Content-Type": resp.headers.get("content-type") || "image/png",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
