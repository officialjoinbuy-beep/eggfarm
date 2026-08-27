"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export default function QrScanModal({
  onCancel,
  onScanned,
}: {
  onCancel: () => void;
  onScanned: (token: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        setError("카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || scannedRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            scannedRef.current = true;
            onScanned(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 p-5">
      <p className="text-white text-[14px] mb-3">구매자의 픽업 QR을 화면에 비춰주세요</p>
      {error ? (
        <p className="text-red-400 text-[13px] text-center">{error}</p>
      ) : (
        <video ref={videoRef} className="w-full max-w-xs rounded-lg" playsInline muted />
      )}
      <canvas ref={canvasRef} className="hidden" />
      <button
        onClick={onCancel}
        className="mt-5 border border-white text-white rounded-lg px-5 py-2 text-sm"
      >
        취소
      </button>
    </div>
  );
}
