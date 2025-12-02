import { NextRequest } from "next/server";
import { setManualReview } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const form = await req.formData();
  const status = String(form.get("status") || "");
  const comment = String(form.get("comment") || "");
  const reviewer = String(form.get("reviewer") || "");
  if (!status || !["approved", "rejected", "needs_changes"].includes(status)) {
    return new Response("invalid status", { status: 400 });
  }
  const ok = await setManualReview(params.id, {
    status: status as any,
    comment: comment || undefined,
    reviewer: reviewer || undefined,
    reviewedAt: new Date().toISOString(),
  });
  if (!ok) return new Response("not found", { status: 404 });
  return new Response(null, { status: 204 });
}
