import { NextRequest } from "next/server";
import { updateCategory } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const form = await req.formData();
  const category = String(form.get("category") || "");
  const allowed = [
    "本科教学类",
    "研究生教学类",
    "科研类",
    "人事/劳动类",
    "国际/港澳台交流类",
    "学工类",
    "院团委类",
    "其他",
  ];
  if (!allowed.includes(category)) return new Response("invalid category", { status: 400 });
  const ok = await updateCategory(params.id, category as any);
  if (!ok) return new Response("not found", { status: 404 });
  return new Response(null, { status: 204 });
}
