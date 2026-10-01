"use client";

import { useState } from "react";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        setBusy(false);
        return;
      }
      window.location.href = data.role === "admin" ? "/admin" : "/";
    } catch {
      setError("Sem conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>Check-in do Hackathon</h1>
        <p className="muted small">Digite o PIN que a organização passou para você.</p>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>
        {error && <div className="notice err">{error}</div>}
        <button className="btn primary" style={{ width: "100%" }} disabled={busy || !pin.trim()}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
