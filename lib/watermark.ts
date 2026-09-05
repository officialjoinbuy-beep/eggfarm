// 선택된 이미지 파일에 촬영시간 워터마크(우측하단)를 그려서
// 새 JPEG Blob으로 반환한다. 최종 저장되는 사진 파일에는 이 시간
// 워터마크만 남고, 동호수 등은 화면 오버레이로만 표시되어 파일엔 남지 않는다.
export async function watermarkImage(file: File): Promise<Blob> {
  const img = await loadImage(file);

  // 아이폰 카메라로 바로 찍은 사진은 원본 해상도가 매우 커서(예: 4000px 이상),
  // 워터마크만 입혀 그대로 올리면 파일 용량이 서버 업로드 제한을 넘어 실패할 수
  // 있었다. 화면/증빙 용도로는 충분한 크기로 다운스케일한다.
  const MAX_DIMENSION = 1600;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const targetWidth = Math.round(img.width * scale);
  const targetHeight = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  const now = new Date();
  const label = now
    .toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\. /g, "-")
    .replace(".", "");

  const fontSize = Math.min(64, Math.max(18, Math.round(canvas.width * 0.028))); // 사진 너비의
    // 약 2.8%, 18~64px 사이로 clamp - 해상도에 비례하게 해서 고해상도 폰카메라 사진에서도
    // 화면 표시 시 눈에 잘 띄면서, 아주 작은 사진에서 과대 확대되는 것도 방지
    // (기존엔 22px 고정이라 4000px대 사진에서는 사실상 안 보이는 크기였음)
  ctx.font = `${fontSize}px sans-serif`;
  const padding = fontSize * 0.6;
  const textWidth = ctx.measureText(label).width;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(
    canvas.width - textWidth - padding * 2 - 12,
    canvas.height - fontSize - padding * 2 - 12,
    textWidth + padding * 2,
    fontSize + padding * 2
  );

  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(
    label,
    canvas.width - textWidth - padding - 12,
    canvas.height - fontSize / 2 - padding - 12
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
