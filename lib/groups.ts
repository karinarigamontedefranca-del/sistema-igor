import { norm } from "./text";

/**
 * Formação de grupos com diversidade.
 *
 * Regras:
 *  1. Tamanho de cada grupo entre `min` e `max` (padrão 5 a 6).
 *  2. Dentro de cada grupo, evitar repetir faculdade e curso.
 *
 * "Custo" de um grupo = número de pares de pessoas com a mesma faculdade
 * + número de pares com o mesmo curso. Custo 0 = todo mundo diferente.
 * O algoritmo distribui as pessoas em rodízio e depois troca pessoas entre
 * grupos enquanto isso reduzir o custo total.
 */

export type Person = { id: string; university?: string | null; course?: string | null };

export type Options = {
  min: number;
  max: number;
  seed?: number;
  restarts?: number;
  iterations?: number;
};

export type Result = { groups: string[][]; warnings: string[] };

const W_UNI = 1;
const W_COURSE = 1;

type P = { id: string; u: string | null; c: string | null };

function toP(p: Person): P {
  return { id: p.id, u: norm(p.university) || null, c: norm(p.course) || null };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Custo de um grupo: pares repetidos de faculdade + pares repetidos de curso. Quem não informou faculdade/curso não pesa. */
export function groupCost(members: { u: string | null; c: string | null }[]): number {
  const us = new Map<string, number>();
  const cs = new Map<string, number>();
  let cost = 0;
  for (const m of members) {
    if (m.u) {
      const k = us.get(m.u) ?? 0;
      cost += k * W_UNI;
      us.set(m.u, k + 1);
    }
    if (m.c) {
      const k = cs.get(m.c) ?? 0;
      cost += k * W_COURSE;
      cs.set(m.c, k + 1);
    }
  }
  return cost;
}

/** Custo de um conjunto de grupos já formados (útil para testes e relatórios). */
export function totalCost(groups: Person[][]): number {
  return groups.reduce((s, g) => s + groupCost(g.map(toP)), 0);
}

/**
 * Define quantos grupos e de que tamanho. Escolhe o nº de grupos que deixa todos
 * dentro de [min, max]; se for impossível (ex.: 7 pessoas com 5–6), escolhe o
 * que se desvia menos. Em empate, prefere menos grupos.
 */
export function planSizes(n: number, min: number, max: number): number[] {
  if (n <= 0) return [];
  let best: { cost: number; sizes: number[] } | null = null;
  for (let g = 1; g <= n; g++) {
    const base = Math.floor(n / g);
    const rem = n % g;
    const sizes = Array.from({ length: g }, (_, i) => base + (i < rem ? 1 : 0));
    const cost = sizes.reduce((s, x) => s + (x < min ? min - x : x > max ? x - max : 0), 0);
    if (!best || cost < best.cost) best = { cost, sizes };
    if (best.cost === 0 && base < min) break;
  }
  return best!.sizes;
}

function sizeWarning(sizes: number[], n: number, min: number, max: number): string | null {
  const off = sizes.filter((s) => s < min || s > max);
  if (off.length === 0) return null;
  const detail = [...new Set(off)].sort((a, b) => a - b).join(", ");
  return `Com ${n} pessoas não dá para deixar todos os grupos entre ${min} e ${max}. ${off.length} grupo(s) ficaram com ${detail} pessoa(s).`;
}

export function buildGroups(people: Person[], opts: Options): Result {
  const { min, max } = opts;
  const n = people.length;
  if (n === 0) return { groups: [], warnings: [] };

  const sizes = planSizes(n, min, max);
  const g = sizes.length;
  const warnings: string[] = [];
  const w = sizeWarning(sizes, n, min, max);
  if (w) warnings.push(w);

  const base = people.map(toP);
  const rand = rng(opts.seed ?? Date.now());
  const restarts = opts.restarts ?? 4;
  const iterations = opts.iterations ?? Math.min(60000, 1500 + n * 200);
  const cmp = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "");

  let best: P[][] | null = null;
  let bestCost = Infinity;

  for (let r = 0; r < restarts && bestCost > 0; r++) {
    // Pessoas parecidas ficam juntas na fila e são distribuídas em rodízio -> já nascem espalhadas.
    const order = shuffle(base, rand).sort((a, b) => cmp(a.u, b.u) || cmp(a.c, b.c));
    const groups: P[][] = sizes.map(() => []);
    let gi = 0;
    for (const p of order) {
      while (groups[gi].length >= sizes[gi]) gi = (gi + 1) % g;
      groups[gi].push(p);
      gi = (gi + 1) % g;
    }

    const costs = groups.map(groupCost);
    let total = costs.reduce((s, x) => s + x, 0);

    if (g > 1) {
      for (let it = 0; it < iterations && total > 0; it++) {
        const a = Math.floor(rand() * g);
        let b = Math.floor(rand() * g);
        if (a === b) continue;
        const i = Math.floor(rand() * groups[a].length);
        const j = Math.floor(rand() * groups[b].length);
        const pa = groups[a][i];
        const pb = groups[b][j];
        groups[a][i] = pb;
        groups[b][j] = pa;
        const ca = groupCost(groups[a]);
        const cb = groupCost(groups[b]);
        const delta = ca + cb - costs[a] - costs[b];
        if (delta <= 0) {
          costs[a] = ca;
          costs[b] = cb;
          total += delta;
        } else {
          groups[a][i] = pa;
          groups[b][j] = pb;
        }
      }
    }

    if (total < bestCost) {
      bestCost = total;
      best = groups.map((gr) => gr.slice());
    }
  }

  return { groups: best!.map((gr) => gr.map((p) => p.id)), warnings };
}

export type LateResult = {
  /** Para cada grupo existente (mesma ordem de `existing`), os ids de quem entra nele. */
  additions: string[][];
  /** Grupos novos, formados só com retardatários. */
  newGroups: string[][];
  warnings: string[];
};

/**
 * Encaixa quem chegou depois dos grupos formados, sem mexer em ninguém que já está num grupo:
 *  - se os retardatários dão para formar grupos novos de min a max, formam grupos novos;
 *  - senão, cada um entra no grupo com vaga em que menos repete faculdade/curso.
 */
export function placeLate(existing: Person[][], late: Person[], opts: Options): LateResult {
  const { min, max } = opts;
  const additions: string[][] = existing.map(() => []);
  const warnings: string[] = [];
  if (late.length === 0) return { additions, newGroups: [], warnings };

  const sizes = planSizes(late.length, min, max);
  if (existing.length === 0 || sizes.every((s) => s >= min && s <= max)) {
    const built = buildGroups(late, opts);
    return { additions, newGroups: built.groups, warnings: built.warnings };
  }

  const rand = rng(opts.seed ?? Date.now());
  const current: P[][] = existing.map((g) => g.map(toP));
  let overflow = false;

  for (const person of shuffle(late.map(toP), rand)) {
    let candidates = current.map((_, idx) => idx).filter((idx) => current[idx].length < max);
    if (candidates.length === 0) {
      overflow = true;
      candidates = current.map((_, idx) => idx);
    }
    let bestIdx = candidates[0];
    let bestKey: [number, number] = [Infinity, Infinity];
    for (const idx of candidates) {
      const added = groupCost([...current[idx], person]) - groupCost(current[idx]);
      const key: [number, number] = [added, current[idx].length];
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        bestKey = key;
        bestIdx = idx;
      }
    }
    current[bestIdx].push(person);
    additions[bestIdx].push(person.id);
  }

  if (overflow) warnings.push(`Todos os grupos já estavam cheios (${max}); alguns passaram do limite para encaixar os retardatários.`);
  return { additions, newGroups: [], warnings };
}
