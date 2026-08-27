export default function Home() {
  return (
    <main className="max-w-md mx-auto p-5 pt-24 text-center">
      <p className="text-[16px] font-medium mb-2">공동구매 주문취합 플랫폼</p>
      <p className="text-[13px] text-neutral-500 mb-8">
        진행자는 로그인 후 공구를 만들고, 구매자는 전달받은 주문 링크로 접속합니다.
      </p>
      <a
        href="/admin/login"
        className="inline-block bg-neutral-900 text-white rounded-lg px-5 py-2.5 text-sm"
      >
        진행자 로그인
      </a>
    </main>
  );
}
