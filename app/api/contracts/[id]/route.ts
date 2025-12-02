import { NextRequest } from "next/server";
import { getContractById } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const item = await getContractById(params.id);
  if (!item) return new Response("Not found", { status: 404 });
  // Return minimal contract info for polling
  return Response.json(
    {
      id: item.id,
      filename: item.filename,
      mime: item.mime,
      category: item.category || null,
      audit: item.audit || null,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

