import { NextResponse } from "next/server";
import { pinsConfigured, roleForPin, setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!pinsConfigured()) {
    return NextResponse.json({ error: "STAFF_PIN / ADMIN_PIN não configurados no servidor." }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const role = pin ? roleForPin(pin) : null;
  if (!role) {
    await new Promise((r) => setTimeout(r, 600)); // freia tentativa em massa
    return NextResponse.json({ error: "PIN incorreto." }, { status: 401 });
  }
  await setSession(role);
  return NextResponse.json({ role });
}
