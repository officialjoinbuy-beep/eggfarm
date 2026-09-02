// Kakao JS SDK를 지연 로드하고 초기화하는 유틸.
// NEXT_PUBLIC_KAKAO_JS_KEY가 설정돼야 실제로 동작하며(카카오 디벨로퍼스에서
// 발급), 아직 키가 없으면 호출부에서 안내만 하고 조용히 무시한다.
declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (settings: Record<string, unknown>) => void;
      };
    };
  }
}

let loadPromise: Promise<boolean> | null = null;

export function loadKakaoSdk(): Promise<boolean> {
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!jsKey) return Promise.resolve(false);
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Kakao?.isInitialized()) return Promise.resolve(true);

  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const existing = document.getElementById("kakao-sdk");
      if (existing) {
        existing.addEventListener("load", () => {
          window.Kakao?.init(jsKey);
          resolve(true);
        });
        return;
      }
      const script = document.createElement("script");
      script.id = "kakao-sdk";
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      script.onload = () => {
        window.Kakao?.init(jsKey);
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

// 공구 추천 링크를 카카오톡으로 바로 공유. SDK/키가 없으면 false를 반환해
// 호출부가 "링크 복사" 등 대체 동작을 할 수 있게 한다.
export async function shareReferralLink(link: string, referralCode: string): Promise<boolean> {
  const ok = await loadKakaoSdk();
  if (!ok || !window.Kakao) return false;

  window.Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: "오더모아 - 공동구매 주문취합, 이제 이걸로 하세요",
      description: "링크 하나로 주문 받고, 자동으로 집계까지. 지금 가입하면 10회 무료체험!",
      imageUrl: "https://www.ordermoa.cloud/og-image.png",
      link: { mobileWebUrl: link, webUrl: link },
    },
    buttons: [
      {
        title: "무료체험 시작하기",
        link: { mobileWebUrl: link, webUrl: link },
      },
    ],
  });
  return true;
}
