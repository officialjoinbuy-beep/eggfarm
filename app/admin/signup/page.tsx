"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    // 시크릿모드 등 localStorage 접근 불가 시에도 가입 자체는 막지 않는다.
    return crypto.randomUUID();
  }
}

// abc+1@gmail.com 같은 별칭(+트릭)으로 같은 메일함을 여러 계정처럼 쓰는 걸 막는다.
function hasPlusTrick(email: string) {
  const local = email.split("@")[0] || "";
  return local.includes("+");
}

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function signup() {
    setError(null);
    if (hasPlusTrick(email)) {
      setError("이메일 주소에 '+' 기호는 사용할 수 없습니다.");
      return;
    }
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
        {repeatDeviceWarning && (
          <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3.5 text-left">
            ⚠️ 이 기기에서 이미 체험 가입 이력이 확인됩니다. 이미 체험해보셨다면 결제를 통해
            정식 이용을 진행해주세요.
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
