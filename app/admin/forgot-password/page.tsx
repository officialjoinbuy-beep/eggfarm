"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Spinner from "@/components/Spinner";

// 비밀번호를 잊은 진행자가 이메일을 입력하면 재설정 링크를 발송한다.
// 존재하지 않는 이메일이어도 동일한 성공 화면을 보여줘(계정 존재 여부 비노출),
// 실제로는 존재하는 계정에만 메일이 나간다.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <main className="max-w-md mx-auto p-5">
        <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
          <p className="text-[15px] font-medium mb-2">재설정 메일을 보냈어요</p>
          <p className="text-[13px] text-neutral-500">
            받은 메일함에서 링크를 눌러 새 비밀번호를 설정해주세요.
            <br />
            메일이 안 온다면 가입 시 사용한 이메일이 맞는지 확인해주세요.
          </p>
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
        <p className="text-[16px] font-medium mb-1">비밀번호 재설정</p>
        <p className="text-[13px] text-neutral-500 mb-5">
          가입하신 이메일을 입력하시면 재설정 링크를 보내드려요.
        </p>

        <input
          className="w-full border rounded px-3 py-2 text-sm mb-3.5"
          placeholder="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 flex items-center justify-center"
        >
          {loading && <Spinner />}
          {loading ? "전송 중..." : "재설정 메일 받기"}
        </button>

        <p className="text-[12px] text-neutral-500 mt-3.5">
          <Link href="/admin/login" className="underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </form>
    </main>
  );
}
