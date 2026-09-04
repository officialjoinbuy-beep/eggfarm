"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, normalizePhone } from "@/lib/format";
import Spinner from "@/components/Spinner";

const DEVICE_ID_KEY = "eggfarm_trial_device_id";

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function hasPlusTrick(email: string) {
  const local = email.split("@")[0] || "";
  return local.includes("+");
}

export default function SignupForm() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repeatDeviceWarning, setRepeatDeviceWarning] = useState(false);

  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    fetch("/api/admin/check-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.repeat) setRepeatDeviceWarning(true);
      })
      .catch(() => {});
  }, []);

  async function signup(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (hasPlusTrick(email)) {
      setError("이메일 주소에 '+' 기호는 사용할 수 없습니다.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 설정해주세요.");
      return;
    }
    const phone = normalizePhone(phoneDisplay);
    if (!phone) {
      setError("연락처를 입력해주세요.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setError("가입에 실패했습니다. 다시 시도해주세요.");
      return;
    }
    await fetch("/api/admin/signup-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, phone, referralCode }),
    }).catch(() => {});
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <main className="max-w-md mx-auto p-5">
        <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
          <p className="text-[15px] font-medium mb-2">가입 확인 메일을 보냈어요</p>
          <p className="text-[13px] text-neutral-500 mb-4">
            받은 메일함에서 인증 후 로그인해주세요.
          </p>
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            참고로, 메일이 몇 분 안에 안 보이면 스팸함도 확인해보세요.
            <br />
            혹시 이미 쓰던 계정이라면{" "}
            <Link href="/admin/login" className="underline text-neutral-500">
              로그인
            </Link>
            , 비밀번호가 기억 안 나면{" "}
            <Link href="/admin/forgot-password" className="underline text-neutral-500">
              비밀번호 재설정
            </Link>
            을 이용해주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <form onSubmit={signup} className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200 text-center">
        <p className="text-[16px] font-medium mb-5">회원가입</p>
        {repeatDeviceWarning && (
          <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3.5 text-left">
            ⚠️ 이 기기에서 이미 체험 가입 이력이 확인됩니다. 이미 체험해보셨다면 결제를 통해
            정식 이용을 진행해주세요.
          </p>
        )}
        {referralCode && (
          <p className="text-[12px] text-neutral-500 bg-white border rounded-lg px-3 py-2 mb-3.5 text-left">
            🎁 친구 추천으로 가입하시는군요! 첫 공구를 만들면 추천인과 회원님 모두에게 3회씩
            크레딧이 지급돼요.
          </p>
        )}
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
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="연락처 (구매 문의 안내용)"
            inputMode="numeric"
            value={phoneDisplay}
            onChange={(e) => setPhoneDisplay(formatPhone(e.target.value))}
          />
        </div>
        {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <Link
            href="/"
            className="flex-1 border rounded-lg py-2.5 text-sm font-medium flex items-center justify-center"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={loading || !email || password.length < 8 || !phoneDisplay}
            className="flex-1 bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 flex items-center justify-center"
          >
            {loading && <Spinner />}
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </div>
        <p className="text-[12px] text-neutral-400 mt-3.5">
          이미 오더모아 계정이 있으신가요?{" "}
          <Link href="/admin/login" className="underline text-neutral-500">
            로그인하기
          </Link>
        </p>
      </form>
    </main>
  );
}
