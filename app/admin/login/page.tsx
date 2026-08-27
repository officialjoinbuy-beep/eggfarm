"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push("/admin");
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
        <p className="text-[16px] font-medium mb-1">진행자 로그인</p>
        <p className="text-[13px] text-neutral-500 mb-5">공동구매 관리 대시보드</p>

        <div className="flex flex-col gap-2.5 text-left mb-3.5">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="이메일"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}

        <button
          onClick={login}
          disabled={loading}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>

        <p className="text-[12px] text-neutral-500 mt-3.5">
          계정이 없으신가요?{" "}
          <a href="/admin/signup" className="text-neutral-900 underline">
            회원가입
          </a>
        </p>
      </div>
    </main>
  );
}
