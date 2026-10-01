"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseTable, toImportRows } from "@/lib/csv";
import { norm } from "@/lib/text";
import type { Participant } from "@/lib/types";

type Msg = { kind: "ok" | "warn" | "err"; lines: string[] };

const byName = (a: Participant, b: Participant) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
const uniq = (xs: (string | null)[]) => new Set(xs.map((x) => norm(x)).filter(Boolean)).size;

export default function AdminClient() {
  const [people, setPeople] = useState<Participant[] | null>(null);
  const [min, setMin] = useState(5);
  const [max, setMax] = useState(6);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<Msg | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/participants", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      setPeople((await res.json()).participants);
    } catch {
      /* mantém a última lista; tenta de novo no próximo ciclo */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !busy) load();
    }, 6000);
    return () => clearInterval(t);
  }, [load, busy]);

  const all = people ?? [];
  const arrived = all.filter((p) => p.checked_in);
  const grouped = arrived.filter((p) => p.group_number !== null);
  const ungrouped = arrived.filter((p) => p.group_number === null);

  const groups = useMemo(() => {
    const m = new Map<number, Participant[]>();
    for (const p of all) {
      if (p.checked_in && p.group_number !== null) {
        const list = m.get(p.group_number) ?? [];
        list.push(p);
        m.set(p.group_number, list);
      }
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([n, list]) => [n, list.sort(byName)] as const);
  }, [all]);

  const rangeInvalid = !(min >= 2 && max >= min && max <= 30);

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    if (res.status === 401) {
      window.location.href = "/login";
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function generate(mode: "all" | "late") {
    if (mode === "all" && grouped.length > 0 && !confirm("Isso vai refazer TODOS os grupos do zero. Continuar?")) return;
    setBusy(mode);
    setMsg(null);
    const { ok, data } = await call("/api/groups", { method: "POST", body: JSON.stringify({ mode, min, max }) });
    if (!ok) setMsg({ kind: "err", lines: [data.error ?? "Não foi possível formar os grupos."] });
    else setMsg({ kind: data.warnings?.length ? "warn" : "ok", lines: [data.message, ...(data.warnings ?? [])] });
    await load();
    setBusy("");
  }

  async function clearGroups() {
    if (!confirm("Desfazer todos os grupos?")) return;
    setBusy("clear");
    await call("/api/groups", { method: "DELETE" });
    setMsg(null);
    await load();
    setBusy("");
  }

  const parsed = useMemo(() => (importText.trim() ? toImportRows(parseTable(importText)) : null), [importText]);

  async function doImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy("import");
    setImportMsg(null);
    const { ok, data } = await call("/api/participants/import", { method: "POST", body: JSON.stringify({ rows: parsed.rows }) });
    if (!ok) setImportMsg({ kind: "err", lines: [data.error ?? "Erro ao importar."] });
    else {
      setImportMsg({
        kind: "ok",
        lines: [`${data.inserted} pessoa(s) importada(s)${data.skipped ? `, ${data.skipped} já existiam e foram ignoradas` : ""}.`],
      });
      setImportText("");
    }
    await load();
    setBusy("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    e.target.value = "";
  }

  async function removeOne(p: Participant) {
    if (!confirm(`Remover ${p.name} da lista?`)) return;
    await call(`/api/participants/${p.id}`, { method: "DELETE" });
    await load();
  }

  async function wipe() {
    const typed = prompt(`Isso apaga TODOS os ${all.length} participantes e os grupos. Digite APAGAR para confirmar:`);
    if (typed !== "APAGAR") return;
    setBusy("wipe");
    await call("/api/participants", { method: "DELETE" });
    setMsg(null);
    await load();
    setBusy("");
  }

  function downloadCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ["Grupo;Nome;Faculdade;Curso"];
    for (const [n, list] of groups) for (const p of list) lines.push([n, esc(p.name), esc(p.university ?? ""), esc(p.course ?? "")].join(";"));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "grupos-hackathon.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const filtered = useMemo(() => {
    const toks = norm(filter).split(" ").filter(Boolean);
    const sorted = all.slice().sort(byName);
    return toks.length ? sorted.filter((p) => toks.every((t) => norm(p.name).includes(t))) : sorted;
  }, [all, filter]);

  const sizes = groups.map(([, l]) => l.length);
  const outOfRange = sizes.filter((s) => s < min || s > max).length;

  return (
    <main className="wrap wide">
      <div className="topbar no-print">
        <h1>Organização</h1>
        <nav>
          <a className="btn sm" href="/">
            Recepção
          </a>
          <button className="btn sm" onClick={logout}>
            Sair
          </button>
        </nav>
      </div>

      <div className="stats no-print">
        <div className="stat ok">
          <b>{arrived.length}</b>
          <span>chegaram</span>
        </div>
        <div className="stat">
          <b>{all.length - arrived.length}</b>
          <span>faltam</span>
        </div>
        <div className="stat">
          <b>{all.length}</b>
          <span>inscritos</span>
        </div>
      </div>

      <section className="card no-print">
        <h2>1. Formar grupos</h2>
        <p className="muted small">
          Usa só quem já fez check-in. Cada grupo tem de {min} a {max} pessoas, tentando misturar faculdades e cursos diferentes.
        </p>
        <div className="inline">
          <div className="field">
            <label htmlFor="min">Mínimo por grupo</label>
            <input id="min" type="number" min={2} max={30} value={min} onChange={(e) => setMin(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="max">Máximo por grupo</label>
            <input id="max" type="number" min={2} max={30} value={max} onChange={(e) => setMax(Number(e.target.value))} />
          </div>
        </div>
        {rangeInvalid && <div className="notice err">O mínimo deve ser ≥ 2 e o máximo ≥ mínimo.</div>}
        <div className="actions">
          <button className="btn primary" disabled={!!busy || arrived.length === 0 || rangeInvalid} onClick={() => generate("all")}>
            {busy === "all" ? "Formando…" : grouped.length ? `Refazer grupos (${arrived.length} presentes)` : `Formar grupos (${arrived.length} presentes)`}
          </button>
          {grouped.length > 0 && ungrouped.length > 0 && (
            <button className="btn" disabled={!!busy || rangeInvalid} onClick={() => generate("late")}>
              {busy === "late" ? "Encaixando…" : `Encaixar ${ungrouped.length} retardatário(s)`}
            </button>
          )}
          {grouped.length > 0 && (
            <button className="btn danger" disabled={!!busy} onClick={clearGroups}>
              Desfazer grupos
            </button>
          )}
        </div>
        {grouped.length > 0 && ungrouped.length > 0 && (
          <p className="muted small" style={{ marginTop: 8 }}>
            “Encaixar retardatários” não mexe em quem já tem grupo: forma grupos novos se der para completar {min}–{max}, senão coloca cada um num grupo com vaga.
          </p>
        )}
        {msg && (
          <div className={`notice ${msg.kind}`}>
            {msg.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </section>

      {groups.length > 0 && (
        <section className="card">
          <div className="topbar" style={{ marginBottom: 0 }}>
            <div>
              <h2>Grupos ({groups.length})</h2>
              <p className="muted small">
                {grouped.length} pessoas · tamanhos: {[...new Set(sizes)].sort((a, b) => b - a).join(", ")}
                {outOfRange > 0 && ` · ${outOfRange} fora de ${min}–${max}`}
              </p>
            </div>
            <nav className="no-print">
              <button className="btn sm" onClick={() => window.print()}>
                Imprimir
              </button>
              <button className="btn sm" onClick={downloadCsv}>
                Baixar CSV
              </button>
            </nav>
          </div>
          <div className="groups">
            {groups.map(([n, list]) => (
              <article className="group" key={n}>
                <header>
                  <h3>Grupo {n}</h3>
                  <span className="muted small">{list.length} pessoas</span>
                </header>
                <div className="chips">
                  <span className="chip">{uniq(list.map((p) => p.university))} faculdade(s)</span>
                  <span className="chip">{uniq(list.map((p) => p.course))} curso(s)</span>
                </div>
                <ul>
                  {list.map((p) => (
                    <li key={p.id}>
                      {p.name}
                      <span>{[p.university, p.course].filter(Boolean).join(" · ") || "—"}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <details className="card no-print" open={all.length === 0}>
        <summary>2. Importar lista de inscritos</summary>
        <p className="muted small">
          Envie um arquivo CSV ou cole direto do Excel/Google Sheets. Colunas: <b>Nome</b>, <b>Faculdade</b>, <b>Curso</b> (com ou sem cabeçalho). Quem já está na lista (mesmo nome e faculdade) é ignorado.
        </p>
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="file">Arquivo CSV</label>
          <input id="file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} />
        </div>
        <div className="field">
          <label htmlFor="paste">…ou cole aqui</label>
          <textarea
            id="paste"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Nome;Faculdade;Curso\nAna Souza;SKEMA;Administração\nJoão Lima;UFMG;Ciência da Computação"}
          />
        </div>
        {parsed && (
          <div className={`notice ${parsed.rows.length ? "ok" : "warn"}`}>
            {parsed.rows.length
              ? `${parsed.rows.length} pessoa(s) reconhecida(s). Ex.: ${parsed.rows[0].name} — ${parsed.rows[0].university || "sem faculdade"} — ${parsed.rows[0].course || "sem curso"}.`
              : "Não reconheci nenhuma pessoa. Confira se a primeira coluna é o nome."}
            {parsed.ignored > 0 && ` ${parsed.ignored} linha(s) sem nome ignorada(s).`}
          </div>
        )}
        <div className="actions">
          <button className="btn primary" disabled={!!busy || !parsed || parsed.rows.length === 0} onClick={doImport}>
            {busy === "import" ? "Importando…" : "Importar"}
          </button>
        </div>
        {importMsg && (
          <div className={`notice ${importMsg.kind}`}>
            {importMsg.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </details>

      <details className="card no-print">
        <summary>3. Participantes ({all.length})</summary>
        <div className="field">
          <input placeholder="Filtrar por nome…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar participantes" />
        </div>
        <div className="plist">
          {filtered.slice(0, 300).map((p) => (
            <div className="prow" key={p.id}>
              <div>
                <b>{p.name}</b> {p.checked_in && <span className="badge">✓</span>}
                <div className="muted small">
                  {[p.university, p.course].filter(Boolean).join(" · ") || "—"}
                  {p.group_number !== null && ` · Grupo ${p.group_number}`}
                </div>
              </div>
              <button className="btn sm danger" onClick={() => removeOne(p)}>
                Remover
              </button>
            </div>
          ))}
          {filtered.length === 0 && <div className="empty small">Nada por aqui.</div>}
          {filtered.length > 300 && <div className="empty small">Mostrando 300 de {filtered.length}. Use o filtro.</div>}
        </div>
        {all.length > 0 && (
          <div className="actions">
            <button className="btn danger" disabled={!!busy} onClick={wipe}>
              Apagar todos os participantes
            </button>
          </div>
        )}
      </details>
    </main>
  );
}
