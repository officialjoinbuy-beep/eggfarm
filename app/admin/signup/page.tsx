"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signup() {
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 설정해주세요.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError("가입에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="max-w-md mx-auto p-5">
        <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
          <p className="text-[15px] font-medium mb-2">가입 확인 메일을 보냈어요</p>
          <p className="text-[13px] text-neutral-500">
            받은 메일함에서 인증 후 로그인해주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
        <p className="text-[16px] font-medium mb-5">진행자 회원가입</p>
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
            placeholder="비밀번호 (8자 이상)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
        <button
          onClick={signup}
          disabled={loading}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "가입 중..." : "회원가입"}
        </button>
      </div>
    </main>
  );
}
