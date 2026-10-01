import { NextResponse } from "next/server";
import { need, serverError, UUID_RE } from "@/lib/api";
import { db } from "@/lib/supabase";
import { COLS } from "@/lib/participants";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Marca (ou desmarca) a chegada. Marcar duas vezes não muda o horário original. */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await need("reception");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.checked_in !== "boolean") {
    return NextResponse.json({ error: "Envie checked_in true ou false." }, { status: 400 });
  }

  try {
    if (body.checked_in) {
      const { error } = await db()
        .from("participants")
        .update({ checked_in: true, checked_in_at: new Date().toISOString() })
        .eq("id", id)
        .eq("checked_in", false);
      if (error) throw error;
    } else {
      // Desfez a chegada: tira também do grupo.
      const { error } = await db()
        .from("participants")
        .update({ checked_in: false, checked_in_at: null, group_number: null })
        .eq("id", id);
      if (error) throw error;
    }
    const { data, error } = await db().from("participants").select(COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Participante não encontrado." }, { status: 404 });
    return NextResponse.json({ participant: data });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await need("admin");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    const { error } = await db().from("participants").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
