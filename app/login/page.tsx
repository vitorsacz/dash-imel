"use client";

import { useActionState } from "react";
import { entrar } from "../actions";

export default function Login() {
  const [estado, acao, enviando] = useActionState(entrar, {});
  return (
    <main className="login">
      <div className="login-box">
        <img src="/logo-escuro.png" alt="Igreja Metodista Livre Mairiporã" />
        <form action={acao}>
        <h2 style={{ margin: 0 }}>Caixa do Som</h2>
        <label>
          Senha da equipe
          <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" required autoFocus />
        </label>
        {estado?.erro && <p className="erro">{estado.erro}</p>}
        <button disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        </form>
      </div>
    </main>
  );
}
