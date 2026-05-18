import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X, SwitchCamera } from "lucide-react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraModal({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const startCamera = async (mode: "environment" | "user") => {
    // Stop previous stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setReady(false);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
    } catch (err) {
      setError(
        "Câmera não disponível. Verifique as permissões do navegador e tente novamente."
      );
      console.error(err);
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onClose();
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#000" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: "rgba(0,0,0,0.7)" }}
      >
        <span style={{ color: "#fff", fontSize: "0.9rem" }}>
          <Camera size={16} style={{ display: "inline", marginRight: 6 }} />
          Câmera
        </span>
        <button
          onClick={() => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            onClose();
          }}
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: "50%",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {/* Alignment grid */}
        {ready && (
          <div
            style={{
              position: "absolute",
              inset: "10%",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 8,
              pointerEvents: "none",
            }}
          >
            {/* Corner markers */}
            {[
              { top: -2, left: -2 },
              { top: -2, right: -2 },
              { bottom: -2, left: -2 },
              { bottom: -2, right: -2 },
            ].map((style, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 20,
                  height: 20,
                  borderColor: "#4f46e5",
                  borderStyle: "solid",
                  borderWidth: 0,
                  ...{
                    0: { borderTopWidth: 3, borderLeftWidth: 3 },
                    1: { borderTopWidth: 3, borderRightWidth: 3 },
                    2: { borderBottomWidth: 3, borderLeftWidth: 3 },
                    3: { borderBottomWidth: 3, borderRightWidth: 3 },
                  }[i],
                  ...style,
                }}
              />
            ))}
          </div>
        )}

        {/* Flash overlay */}
        {flash && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#fff",
              opacity: 0.7,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Error state */}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 32,
              textAlign: "center",
            }}
          >
            <Camera size={48} style={{ color: "#4b5563" }} />
            <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>{error}</p>
            <button
              onClick={() => startCamera(facingMode)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 10,
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              <RotateCcw size={14} />
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loading */}
        {!ready && !error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "3px solid rgba(255,255,255,0.2)",
                borderTop: "3px solid #4f46e5",
                animation: "spin 1s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="flex items-center justify-center gap-8 py-6 shrink-0"
        style={{ background: "rgba(0,0,0,0.8)" }}
      >
        {/* Switch camera */}
        <button
          onClick={switchCamera}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
          }}
          title="Alternar câmera"
        >
          <SwitchCamera size={20} />
        </button>

        {/* Capture button */}
        <button
          onClick={capture}
          disabled={!ready}
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: ready ? "#fff" : "rgba(255,255,255,0.3)",
            border: "4px solid rgba(255,255,255,0.5)",
            cursor: ready ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: ready ? "0 0 0 4px rgba(255,255,255,0.2)" : "none",
            transition: "all 0.2s",
          }}
          title="Capturar foto"
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: ready ? "#fff" : "rgba(255,255,255,0.2)",
              border: "2px solid #1e1e2e",
            }}
          />
        </button>

        {/* Spacer */}
        <div style={{ width: 48 }} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
