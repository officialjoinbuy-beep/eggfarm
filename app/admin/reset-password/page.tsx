"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

// 이메일의 재설정 링크를 눌러 도착하는 화면. 최신 Supabase는 링크에 세션을
// 바로 담아주지 않고 임시 코드(?code=...)만 담아 보내기 때문에, 화면이
// 뜨자마자 그 코드를 실제 로그인 세션으로 교환하는 절차가 먼저 필요하다.
// 이 교환이 끝나야만 비밀번호 변경이 가능하다.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function verify() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError("링크가 만료됐거나 이미 사용됐어요. 비밀번호 재설정을 다시 요청해주세요.");
          setVerifying(false);
          return;
        }
        setReady(true);
        setVerifying(false);
        return;
      }

      // 구버전 방식(#access_token=... 해시)은 Supabase 클라이언트가 초기화
      // 시점에 자동으로 세션을 인식하므로, 세션이 이미 잡혔는지만 확인한다.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
      } else {
        setError("링크가 만료됐거나 이미 사용됐어요. 비밀번호 재설정을 다시 요청해주세요.");
      }
      setVerifying(false);
    }
    verify();
  }, []);

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
      setError("변경에 실패했어요. 비밀번호 재설정을 다시 요청해주세요.");
      return;
    }
    router.push("/admin");
  }

  if (verifying) {
    return (
      <main className="max-w-md mx-auto p-5 flex justify-center py-16">
        <Spinner />
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="max-w-md mx-auto p-5">
        <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
          <p className="text-[15px] font-medium mb-2">링크를 확인할 수 없어요</p>
          <p className="text-[13px] text-red-600 mb-4">{error}</p>
          <a href="/admin/forgot-password" className="text-[13px] underline text-neutral-500">
            비밀번호 재설정 다시 요청하기
          </a>
        </div>
      </main>
    );
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
