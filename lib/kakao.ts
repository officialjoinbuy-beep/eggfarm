import "server-only";

// 카카오 "나에게 보내기"(talk_message) API 연동 헬퍼.
// 사용 전 필요한 환경변수:
// - KAKAO_REST_API_KEY: 카카오 디벨로퍼스 앱의 REST API 키
// - KAKAO_REDIRECT_URI: 카카오 로그인 인증 후 돌아올 콜백 주소
//   (예: https://ordermoa.kr/api/kakao/callback)

const REST_API_KEY = process.env.KAKAO_REST_API_KEY || "";

export function getKakaoAuthorizeUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: REST_API_KEY,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "talk_message",
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeKakaoCode(code: string, redirectUri: string) {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: REST_API_KEY,
      redirect_uri: redirectUri,
      code,
    }),
  });
  if (!res.ok) throw new Error("카카오 토큰 교환 실패");
  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export async function refreshKakaoToken(refreshToken: string) {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: REST_API_KEY,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("카카오 토큰 갱신 실패");
  return (await res.json()) as { access_token: string; expires_in: number };
}

// 카카오톡 "나에게 보내기"로 텍스트 메모 전송.
export async function sendKakaoMemo(accessToken: string, text: string, linkUrl?: string) {
  const templateObject = {
    object_type: "text",
    text,
    link: { web_url: linkUrl || "https://ordermoa.kr", mobile_web_url: linkUrl || "https://ordermoa.kr" },
  };
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`카카오 메시지 전송 실패: ${body}`);
  }
}
