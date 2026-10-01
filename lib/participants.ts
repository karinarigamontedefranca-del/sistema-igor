import { db } from "./supabase";
import type { Participant } from "./types";

export const COLS = "id,name,university,course,checked_in,checked_in_at,group_number";

/** Busca todos os participantes (o Supabase limita 1000 linhas por consulta, então paginamos). */
export async function fetchAllParticipants(): Promise<Participant[]> {
  const out: Participant[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db()
      .from("participants")
      .select(COLS)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Participant[]));
    if (!data || data.length < size) break;
  }
  return out;
}
