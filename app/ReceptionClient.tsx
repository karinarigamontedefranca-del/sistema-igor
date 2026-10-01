"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { norm } from "@/lib/text";
import type { Participant } from "@/lib/types";

type Tab = "faltam" | "chegaram" | "todos";

const MAX_SHOWN = 80;
const byName = (a: Participant, b: Participant) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

function hhmm(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function sub(p: Participant) {
  return [p.university, p.course].filter(Boolean).join(" · ") || "Sem faculdade/curso";
}

export default function ReceptionClient({ isAdmin }: { isAdmin: boolean }) {
  const [people, setPeople] = useState<Participant[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("faltam");
  const [toast, setToast] = useState<Participant | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const inflight = useRef(0);
  const mutations = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const version = mutations.current;
    try {
      const res = await fetch("/api/participants", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Descarta a resposta se uma marcação aconteceu enquanto ela viajava (evita "piscar" de volta).
      if (inflight.current === 0 && version === mutations.current) setPeople(data.participants);
      setError("");
    } catch {
      setError("Sem conexão com o servidor. Tentando de novo…");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function mark(p: Participant, value: boolean) {
    mutations.current++;
    inflight.current++;
    const now = new Date().toISOString();
    setPeople((cur) =>
      cur
        ? cur.map((x) =>
            x.id === p.id
              ? { ...x, checked_in: value, checked_in_at: value ? now : null, group_number: value ? x.group_number : null }
              : x,
          )
        : cur,
    );
    try {
      const res = await fetch(`/api/participants/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ checked_in: value }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const { participant } = await res.json();
      setPeople((cur) => (cur ? cur.map((x) => (x.id === p.id ? participant : x)) : cur));
      setError("");
      if (value) {
        setToast(participant);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 6000);
        setQ("");
        inputRef.current?.focus();
      } else {
        setToast(null);
      }
    } catch {
      setPeople((cur) => (cur ? cur.map((x) => (x.id === p.id ? p : x)) : cur));
      setError(`Não consegui registrar ${p.name}. Confira a internet e tente de novo.`);
    } finally {
      inflight.current--;
      mutations.current++;
    }
  }

  async function addWalkIn(name: string, university: string, course: string): Promise<boolean> {
    mutations.current++;
    inflight.current++;
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, university, course }),
      });
      if (!res.ok) throw new Error();
      const { participant } = await res.json();
      setPeople((cur) => (cur ? [...cur, participant] : [participant]));
      setToast(participant);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
      setQ("");
      setShowAdd(false);
      return true;
    } catch {
      setError("Não consegui cadastrar. Tente de novo.");
      return false;
    } finally {
      inflight.current--;
      mutations.current++;
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const indexed = useMemo(() => (people ?? []).slice().sort(byName).map((p) => ({ p, key: norm(p.name) })), [people]);
  const total = people?.length ?? 0;
  const arrived = people?.filter((p) => p.checked_in).length ?? 0;
  const missing = total - arrived;

  const tokens = useMemo(() => norm(q).split(" ").filter(Boolean), [q]);
  const searching = tokens.length > 0;

  const visible = useMemo(() => {
    let list = indexed;
    if (searching) list = list.filter((x) => tokens.every((t) => x.key.includes(t)));
    else if (tab === "faltam") list = list.filter((x) => !x.p.checked_in);
    else if (tab === "chegaram") list = list.filter((x) => x.p.checked_in);
    const out = list.map((x) => x.p);
    if (!searching && tab === "chegaram") out.sort((a, b) => (b.checked_in_at ?? "").localeCompare(a.checked_in_at ?? ""));
    return out;
  }, [indexed, searching, tokens, tab]);

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>Recepção</h1>
        <nav>
          {isAdmin && (
            <a className="btn sm" href="/admin">
              Organização
            </a>
          )}
          <button className="btn sm" onClick={logout}>
            Sair
          </button>
        </nav>
      </div>

      <div className="stats">
        <div className="stat ok">
          <b>{arrived}</b>
          <span>chegaram</span>
        </div>
        <div className="stat">
          <b>{missing}</b>
          <span>faltam</span>
        </div>
        <div className="stat">
          <b>{total}</b>
          <span>inscritos</span>
        </div>
      </div>
      <div className="bar" aria-hidden>
        <i style={{ width: total ? `${(arrived / total) * 100}%` : 0 }} />
      </div>

      <input
        ref={inputRef}
        className="search"
        placeholder="Digite o nome da pessoa…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Buscar pessoa pelo nome"
      />

      {error && <div className="notice err">{error}</div>}

      {!searching && (
        <div className="tabs" role="group" aria-label="Filtro">
          {(
            [
              ["faltam", `Faltam (${missing})`],
              ["chegaram", `Chegaram (${arrived})`],
              ["todos", `Todos (${total})`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} className="tab" aria-pressed={tab === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {searching && <div style={{ height: 12 }} />}

      {people === null ? (
        <div className="empty">Carregando…</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          {searching ? (
            <>
              <p>Ninguém encontrado com “{q}”.</p>
              <p className="small">Tente só o primeiro nome ou parte do sobrenome.</p>
            </>
          ) : total === 0 ? (
            <p>Nenhum inscrito ainda. A organização precisa importar a lista.</p>
          ) : tab === "faltam" ? (
            <p>Todo mundo chegou! 🎉</p>
          ) : (
            <p>Ninguém por aqui ainda.</p>
          )}
        </div>
      ) : (
        <div className="list">
          {visible.slice(0, MAX_SHOWN).map((p) => (
            <div key={p.id} className={`row${p.checked_in ? " arrived" : ""}`}>
              <div className="who">
                <b>{p.name}</b>
                <span>{sub(p)}</span>
              </div>
              <div className="act">
                {p.checked_in ? (
                  <>
                    <span className="badge">✓ Chegou {hhmm(p.checked_in_at)}</span>
                    <button
                      className="btn ghost"
                      onClick={() => {
                        if (confirm(`Desfazer a chegada de ${p.name}?`)) mark(p, false);
                      }}
                    >
                      desfazer
                    </button>
                  </>
                ) : (
                  <button className="btn go" onClick={() => mark(p, true)}>
                    Chegou
                  </button>
                )}
              </div>
            </div>
          ))}
          {visible.length > MAX_SHOWN && (
            <p className="empty small">Mostrando {MAX_SHOWN} de {visible.length}. Digite mais do nome para filtrar.</p>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {showAdd ? (
          <WalkIn initialName={q} onCancel={() => setShowAdd(false)} onSave={addWalkIn} />
        ) : (
          <button className="btn" onClick={() => setShowAdd(true)}>
            Pessoa não está na lista? Cadastrar agora
          </button>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>✓ {toast.name} registrado(a)</span>
          <button className="btn ghost" onClick={() => mark(toast, false)}>
            desfazer
          </button>
        </div>
      )}
    </main>
  );
}

function WalkIn({
  initialName,
  onCancel,
  onSave,
}: {
  initialName: string;
  onCancel: () => void;
  onSave: (name: string, university: string, course: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialName);
  const [university, setUniversity] = useState("");
  const [course, setCourse] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await onSave(name.trim(), university.trim(), course.trim());
    if (!ok) setBusy(false);
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Cadastrar na hora</h2>
      <p className="muted small">A pessoa já entra como “chegou”. Preencha faculdade e curso para ela ser considerada na hora de formar os grupos.</p>
      <div className="field" style={{ marginTop: 10 }}>
        <label htmlFor="w-name">Nome completo</label>
        <input id="w-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="w-uni">Faculdade</label>
        <input id="w-uni" value={university} onChange={(e) => setUniversity(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="w-course">Curso</label>
        <input id="w-course" value={course} onChange={(e) => setCourse(e.target.value)} />
      </div>
      <div className="actions">
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? "Salvando…" : "Cadastrar e marcar chegada"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
