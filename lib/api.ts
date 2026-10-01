import { NextResponse } from "next/server";
import { getRole, type Role } from "./auth";

/** Garante que quem chamou está logado (e é admin, quando exigido). */
export async function need(min: Role): Promise<{ role: Role } | { error: NextResponse }> {
  const role = await getRole();
  if (!role) return { error: NextResponse.json({ error: "Faça login novamente." }, { status: 401 }) };
  if (min === "admin" && role !== "admin") {
    return { error: NextResponse.json({ error: "Só a organização pode fazer isso." }, { status: 403 }) };
  }
  return { role };
}

export function serverError(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Erro inesperado";
  console.error(e);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
