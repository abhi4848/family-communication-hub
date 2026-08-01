'use client';

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await api<{ user: { role: "PARENT" | "KID" } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      router.push(result.user.role === "KID" ? "/kid" : "/family");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold">Family Hub</h1>
        <p className="mt-2 text-slate-500">Private family communication</p>

        <label className="mt-8 block text-sm font-medium">Email</label>
        <input className="mt-2 w-full rounded-xl border p-3" type="email" value={email}
          onChange={e => setEmail(e.target.value)} required />

        <label className="mt-4 block text-sm font-medium">Password</label>
        <input className="mt-2 w-full rounded-xl border p-3" type="password" value={password}
          onChange={e => setPassword(e.target.value)} required />

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}

        <button className="mt-6 w-full rounded-xl bg-slate-900 p-3 font-semibold text-white">
          Sign in
        </button>
      </form>
    </main>
  );
}
