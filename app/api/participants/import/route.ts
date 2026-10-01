import { NextResponse } from "next/server";
import { need, serverError } from "@/lib/api";
import { db } from "@/lib/supabase";
import { fetchAllParticipants } from "@/lib/participants";
import { norm } from "@/lib/text";
import type { ImportRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Importa a lista de inscritos. Ignora quem já existe (mesmo nome + faculdade). */
export async function POST(req: Request) {
  const auth = await need("admin");
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ error: "Máximo de 5000 linhas por importação." }, { status: 400 });

  try {
    const existing = await fetchAllParticipants();
    const seen = new Set(existing.map((p) => `${norm(p.name)}|${norm(p.university)}`));

    const toInsert: { name: string; university: string | null; course: string | null }[] = [];
    let skipped = 0;
    for (const r of rows) {
      const name = String(r?.name ?? "").trim().slice(0, 200);
      if (!name) continue;
      const university = String(r?.university ?? "").trim().slice(0, 200);
      const course = String(r?.course ?? "").trim().slice(0, 200);
      const key = `${norm(name)}|${norm(university)}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      toInsert.push({ name, university: university || null, course: course || null });
    }

    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await db().from("participants").insert(toInsert.slice(i, i + 500));
      if (error) throw error;
    }
    return NextResponse.json({ inserted: toInsert.length, skipped });
  } catch (e) {
    return serverError(e);
  }
}
