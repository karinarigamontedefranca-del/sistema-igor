import { norm } from "./text";
import type { ImportRow } from "./types";

/** Lê CSV/TSV (vírgula, ponto e vírgula ou tab; aceita aspas). Dá para colar direto do Excel/Google Sheets. */
export function parseTable(raw: string): string[][] {
  const text = raw.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const delim = [";", "\t", ","]
    .map((d) => ({ d, n: firstLine.split(d).length - 1 }))
    .sort((a, b) => b.n - a.n)[0];
  const sep = delim.n > 0 ? delim.d : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const NAME_HEADERS = ["nome", "nome completo", "name", "participante"];
const UNI_HEADERS = ["faculdade", "universidade", "instituicao", "university", "escola", "college"];
const COURSE_HEADERS = ["curso", "course", "graduacao"];

/** Converte a tabela em participantes. Com cabeçalho, acha as colunas pelo nome; sem, assume: nome, faculdade, curso. */
export function toImportRows(table: string[][]): { rows: ImportRow[]; ignored: number } {
  if (table.length === 0) return { rows: [], ignored: 0 };

  const header = table[0].map(norm);
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));
  const hasHeader = nameIdx >= 0;

  let n = 0;
  let u = 1;
  let c = 2;
  if (hasHeader) {
    n = nameIdx;
    u = header.findIndex((h) => UNI_HEADERS.includes(h));
    c = header.findIndex((h) => COURSE_HEADERS.includes(h));
  }

  const body = hasHeader ? table.slice(1) : table;
  const rows: ImportRow[] = [];
  let ignored = 0;
  for (const r of body) {
    const name = (r[n] ?? "").trim();
    if (!name) {
      ignored++;
      continue;
    }
    rows.push({
      name,
      university: u >= 0 ? (r[u] ?? "").trim() : "",
      course: c >= 0 ? (r[c] ?? "").trim() : "",
    });
  }
  return { rows, ignored };
}
