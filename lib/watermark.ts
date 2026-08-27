// 선택된 이미지 파일에 촬영시간 워터마크(우측하단)를 그려서
// 새 JPEG Blob으로 반환한다. 최종 저장되는 사진 파일에는 이 시간
// 워터마크만 남고, 동호수 등은 화면 오버레이로만 표시되어 파일엔 남지 않는다.
export async function watermarkImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

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

  const fontSize = 22; // 이미지 해상도와 무관하게 항상 고정 크기로 표시(작은 사진에서 과대 확대 방지)
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
