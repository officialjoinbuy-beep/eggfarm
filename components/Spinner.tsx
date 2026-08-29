// 버튼 클릭이 실제로 처리 중임을 보여주는 작은 회전 스피너.
// 버튼 텍스트 앞에 인라인으로 넣어 쓴다: {loading && <Spinner />}처리중...
export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-[-2px] mr-1.5 ${className}`}
      aria-hidden="true"
    />
  );
}
