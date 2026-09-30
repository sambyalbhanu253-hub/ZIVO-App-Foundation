import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

type Props = {
  file: File;
  onClose: () => void;
  onComplete: (url: string) => void;
  onUploading: (uploading: boolean) => void;
  onError: (message: string) => void;
};

const SIZE = 280;

export default function AvatarCropDialog({ file, onClose, onComplete, onUploading, onError }: Props) {
  const [url, setUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => setError("This image could not be opened. Choose another photo.");
    image.src = preview;
    return () => URL.revokeObjectURL(preview);
  }, [file]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? [],
      );
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const scale =
    dimensions.width && dimensions.height ? Math.max(SIZE / dimensions.width, SIZE / dimensions.height) * zoom : 1;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  const maxX = Math.max(0, (width - SIZE) / 2);
  const maxY = Math.max(0, (height - SIZE) / 2);
  const clamp = (x: number, y: number) => ({
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  });
  const position = clamp(offset.x, offset.y);

  const save = async () => {
    if (busyRef.current || !url || !dimensions.width) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image cropping is not supported on this device.");
      const factor = 512 / SIZE;
      context.drawImage(
        image,
        (SIZE / 2 + position.x - width / 2) * factor,
        (SIZE / 2 + position.y - height / 2) * factor,
        width * factor,
        height * factor,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("Could not prepare cropped photo."))),
          "image/jpeg",
          0.9,
        ),
      );
      const cropped = new File([blob], `zivo-avatar-${crypto.randomUUID()}.jpg`, { type: "image/jpeg" });
      onUploading(true);
      const result = await window.genmb.storage.upload(cropped, { folder: "zivo-avatars", onProgress: setProgress });
      onComplete(result.url);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to save the cropped photo.";
      setError(message);
      onError(message);
    } finally {
      onUploading(false);
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-crop-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-float"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="avatar-crop-title" className="text-lg font-extrabold text-card-foreground">
            Frame your profile photo
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close photo editor"
            onClick={onClose}
            disabled={busy}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Drag to reposition your face. Zoom to fit the circle.</p>
        <div
          className="mx-auto mt-5 size-[280px] max-w-full overflow-hidden rounded-full border-2 border-primary bg-muted touch-none select-none"
          aria-label="Drag photo to reposition within circular frame"
          onPointerDown={(event) => {
            if (busy || !dimensions.width) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
          }}
          onPointerMove={(event) => {
            if (dragRef.current)
              setOffset(
                clamp(
                  dragRef.current.startX + event.clientX - dragRef.current.x,
                  dragRef.current.startY + event.clientY - dragRef.current.y,
                ),
              );
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
        >
          <div className="relative size-full overflow-hidden rounded-full">
            {url && dimensions.width > 0 && (
              <img
                src={url}
                alt="Cropped avatar preview"
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width,
                  height,
                  left: `calc(50% + ${position.x}px)`,
                  top: `calc(50% + ${position.y}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}
          </div>
        </div>
        <label htmlFor="avatar-zoom" className="mt-5 block text-sm font-bold text-card-foreground">
          Zoom
        </label>
        <input
          id="avatar-zoom"
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          disabled={busy || !dimensions.width}
          onChange={(event) => {
            const next = Number(event.target.value);
            setZoom(next);
            setOffset({ x: 0, y: 0 });
          }}
          className="mt-2 w-full accent-primary"
        />
        {busy && (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Uploading cropped photo… {Math.round(progress)}%
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-primary">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 flex-1 rounded-xl border border-border text-sm font-bold text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !dimensions.width}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} {busy ? "Uploading…" : "Use this photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
