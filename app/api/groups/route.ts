import { NextResponse } from "next/server";
import { clampInt, need, serverError } from "@/lib/api";
import { db } from "@/lib/supabase";
import { fetchAllParticipants } from "@/lib/participants";
import { buildGroups, placeLate } from "@/lib/groups";

export const dynamic = "force-dynamic";

async function assign(number: number, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await db().from("participants").update({ group_number: number }).in("id", ids);
  if (error) throw error;
}

/**
 * Forma grupos só com quem já chegou.
 *  mode "all":  refaz todos os grupos do zero.
 *  mode "late": mantém os grupos que já existem e encaixa só quem chegou depois.
 */
export async function POST(req: Request) {
  const auth = await need("admin");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const min = clampInt(body?.min, 2, 30, 5);
  const max = clampInt(body?.max, 2, 30, 6);
  if (max < min) return NextResponse.json({ error: "O máximo não pode ser menor que o mínimo." }, { status: 400 });
  const mode = body?.mode === "late" ? "late" : "all";

  try {
    const present = (await fetchAllParticipants()).filter((p) => p.checked_in);
    if (present.length === 0) {
      return NextResponse.json({ error: "Ninguém fez check-in ainda." }, { status: 400 });
    }

    const grouped = present.filter((p) => p.group_number !== null);
    const ungrouped = present.filter((p) => p.group_number === null);

    if (mode === "late" && grouped.length > 0) {
      if (ungrouped.length === 0) {
        return NextResponse.json({ error: "Não há retardatários sem grupo." }, { status: 400 });
      }
      const numbers = [...new Set(grouped.map((p) => p.group_number as number))].sort((a, b) => a - b);
      const existing = numbers.map((n) => grouped.filter((p) => p.group_number === n));
      const result = placeLate(existing, ungrouped, { min, max });

      for (let i = 0; i < numbers.length; i++) await assign(numbers[i], result.additions[i]);
      let next = numbers[numbers.length - 1] + 1;
      for (const g of result.newGroups) await assign(next++, g);

      const placed = result.additions.flat().length;
      const created = result.newGroups.length;
      const parts = [];
      if (placed) parts.push(`${placed} pessoa(s) encaixada(s) em grupos existentes`);
      if (created) parts.push(`${created} grupo(s) novo(s) formado(s)`);
      return NextResponse.json({ message: parts.join(" e ") + ".", warnings: result.warnings });
    }

    const result = buildGroups(present, { min, max });
    for (let i = 0; i < result.groups.length; i++) await assign(i + 1, result.groups[i]);
    return NextResponse.json({
      message: `${result.groups.length} grupo(s) formado(s) com ${present.length} pessoas.`,
      warnings: result.warnings,
    });
  } catch (e) {
    return serverError(e);
  }
}

/** Desfaz os grupos (todo mundo fica sem grupo). */
export async function DELETE() {
  const auth = await need("admin");
  if ("error" in auth) return auth.error;
  try {
    const { error } = await db().from("participants").update({ group_number: null }).not("group_number", "is", null);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
