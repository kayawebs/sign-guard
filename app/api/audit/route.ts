import { NextRequest } from "next/server";
import { auditById } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get("id") || "");
  if (!id) return new Response("missing id", { status: 400 });
  const ok = await auditById(id);
  if (!ok) return new Response("not found", { status: 404 });
  return new Response(null, { status: 204 });
}
