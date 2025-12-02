import { NextRequest, NextResponse } from "next/server";
import { deleteContract } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await deleteContract(params.id);
  if (!ok) return new Response("not found", { status: 404 });
  // Redirect back to list after deletion so the browser doesn't stay on /api URL
  return NextResponse.redirect(new URL("/contracts", _req.url), { status: 302 });
}
