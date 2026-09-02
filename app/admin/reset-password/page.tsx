"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

// 이메일의 재설정 링크를 눌러 도착하는 화면. Supabase가 URL에 담아준 임시
// 인증 정보로 세션이 자동 로그인되므로, 여기서는 새 비밀번호만 받아서
// updateUser로 바꿔주면 된다.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 설정해주세요.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("링크가 만료됐을 수 있어요. 비밀번호 재설정을 다시 요청해주세요.");
      return;
    }
    router.push("/admin");
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <form
        onSubmit={submit}
        className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center"
      >
        <p className="text-[16px] font-medium mb-1">새 비밀번호 설정</p>
        <p className="text-[13px] text-neutral-500 mb-5">새로 사용하실 비밀번호를 입력해주세요.</p>

        <input
          className="w-full border rounded px-3 py-2 text-sm mb-3.5"
          placeholder="새 비밀번호 (8자 이상)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-[13px] text-red-600 mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading || password.length < 8}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 flex items-center justify-center"
        >
          {loading && <Spinner />}
          {loading ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </main>
  );
}
