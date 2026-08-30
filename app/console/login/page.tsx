"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";

export default function ConsoleLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function login() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/console/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "로그인에 실패했습니다.");
      return;
    }
    router.push("/console");
    router.refresh();
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
        <p className="text-[16px] font-medium mb-5">운영 콘솔</p>
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
        />
        {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center"
        >
          {loading && <Spinner />}
          {loading ? "확인 중..." : "로그인"}
        </button>
      </div>
    </main>
  );
}
