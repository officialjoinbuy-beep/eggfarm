"use client";

export default function LimitReachedModal({
  supportChatUrl,
  onClose,
}: {
  supportChatUrl: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-5 z-50">
      <div className="bg-white rounded-2xl border p-6 w-full max-w-sm shadow-xl text-center">
        <p className="text-[28px] mb-2">🔒</p>
        <p className="text-[15px] font-medium mb-2">
          공구 생성 가능 횟수를 모두 사용하셨습니다
        </p>
        <p className="text-[13px] text-neutral-500 mb-5 leading-relaxed">
          추가 이용을 원하시면 문의해주세요.
          <br />
          기존에 만들어둔 공구는 계속 정상 이용 가능합니다.
        </p>
        {supportChatUrl ? (
          <a
            href={supportChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium mb-2"
          >
            오픈채팅 문의하기
          </a>
        ) : (
          <p className="text-[12px] text-neutral-400 mb-2">
            문의 연결이 설정되어 있지 않습니다. 진행자에게 직접 연락해주세요.
          </p>
        )}
        <button onClick={onClose} className="w-full border rounded-lg py-2.5 text-sm">
          닫기
        </button>
      </div>
    </div>
  );
}
