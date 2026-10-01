import { NextResponse } from "next/server";
import { need, serverError } from "@/lib/api";
import { db } from "@/lib/supabase";
import { COLS, fetchAllParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Lista todo mundo (recepção filtra no navegador, é instantâneo). */
export async function GET() {
  const auth = await need("reception");
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ participants: await fetchAllParticipants() }, { headers: noStore });
  } catch (e) {
    return serverError(e);
  }
}

/** Cadastra alguém que não estava na lista (já entra como "chegou"). */
export async function POST(req: Request) {
  const auth = await need("reception");
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  try {
    const { data, error } = await db()
      .from("participants")
      .insert({
        name,
        university: String(body?.university ?? "").trim().slice(0, 200) || null,
        course: String(body?.course ?? "").trim().slice(0, 200) || null,
        checked_in: true,
        checked_in_at: new Date().toISOString(),
      })
      .select(COLS)
      .single();
    if (error) throw error;
    return NextResponse.json({ participant: data });
  } catch (e) {
    return serverError(e);
  }
}

/** Apaga todos os participantes (só organização). */
export async function DELETE() {
  const auth = await need("admin");
  if ("error" in auth) return auth.error;
  try {
    const { error } = await db().from("participants").delete().not("id", "is", null);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
