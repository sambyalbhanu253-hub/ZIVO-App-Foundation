import { useEffect, useRef, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { updateCreatorPost, type StoredPost } from "../lib/posts";
import { validateText } from "../lib/textSafety";

type Props = { post: StoredPost; creatorId: string; onClose: () => void; onSaved: (post: StoredPost) => void };

export default function EditVideoDetailsDialog({ post, creatorId, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(post.title || post.caption || "");
  const [description, setDescription] = useState(post.description || "");
  const [hashtags, setHashtags] = useState(post.hashtags.join(" "));
  const [visibility, setVisibility] = useState(post.visibility);
  const [thumbnailUrl, setThumbnailUrl] = useState(post.thumbnailUrl || "");
  const [frames, setFrames] = useState<string[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const uploaderRef = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement);

  useEffect(() => {
    const uploader = uploaderRef.current;
    if (!uploader) return;
    const complete = (event: Event) => {
      const detail = (event as CustomEvent<{ files?: { url: string }[] }>).detail;
      const url = detail?.files?.[0]?.url;
      if (url) {
        setThumbnailUrl(url);
        setSelectedFrame(null);
        setThumbnailUploading(false);
        setError("");
      } else {
        setThumbnailUploading(false);
        setError("Thumbnail upload completed without a saved image. Try again.");
      }
    };
    const progress = () => {
      setThumbnailUploading(true);
      setError("");
    };
    const failure = (event: Event) => {
      setThumbnailUploading(false);
      setError((event as CustomEvent<{ message?: string }>).detail?.message || "Unable to upload thumbnail.");
    };
    uploader.addEventListener("genmb-upload-complete", complete);
    uploader.addEventListener("genmb-upload-progress", progress);
    uploader.addEventListener("genmb-upload-error", failure);
    return () => {
      uploader.removeEventListener("genmb-upload-complete", complete);
      uploader.removeEventListener("genmb-upload-progress", progress);
      uploader.removeEventListener("genmb-upload-error", failure);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const waitFor = (name: string) =>
      new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          window.clearTimeout(timer);
          video.removeEventListener(name, ready);
          video.removeEventListener("error", failed);
        };
        const ready = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error("This saved video cannot be decoded for frame selection. You can upload an image instead."));
        };
        const timer = window.setTimeout(() => {
          cleanup();
          reject(new Error("Frame extraction timed out. You can upload an image instead."));
        }, 12000);
        video.addEventListener(name, ready, { once: true });
        video.addEventListener("error", failed, { once: true });
      });
    setFramesLoading(true);
    void (async () => {
      try {
        const metadata = waitFor("loadedmetadata");
        video.src = post.mediaUrl;
        video.load();
        await metadata;
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight)
          throw new Error("No seekable frames are available. Upload an image instead.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(320, video.videoWidth);
        canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Your browser cannot capture video frames. Upload an image instead.");
        const results: string[] = [];
        for (const fraction of [0.15, 0.5, 0.85]) {
          const seeked = waitFor("seeked");
          video.currentTime = Math.min(video.duration - 0.001, video.duration * fraction);
          await seeked;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          results.push(canvas.toDataURL("image/jpeg", 0.76));
        }
        if (active) setFrames(results);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load thumbnail frames.");
      } finally {
        if (active) setFramesLoading(false);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    })();
    return () => {
      active = false;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [post.mediaUrl]);

  useEffect(
    () => () => {
      triggerRef.current?.focus();
    },
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving && !thumbnailUploading) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)",
        ),
      );
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        controls[controls.length - 1].focus();
      } else if (!event.shiftKey && index === controls.length - 1) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, saving, thumbnailUploading]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || thumbnailUploading) return;
    if (!title.trim()) {
      setError("Add a title before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let savedThumbnail = thumbnailUrl || undefined;
      if (selectedFrame !== null) {
        const response = await fetch(frames[selectedFrame]);
        const blob = await response.blob();
        const file = new File([blob], `zivo-thumbnail-${post.id}.jpg`, { type: "image/jpeg" });
        const uploaded = await window.genmb.storage.upload(file, { folder: "zivo-thumbnails" });
        savedThumbnail = uploaded.url;
      }
      const updated = await updateCreatorPost({
        creatorId,
        postId: post.id,
        title: validateText(title, "Video title", 120, true),
        description: validateText(description, "Description", 2000),
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        visibility,
        thumbnailUrl: savedThumbnail,
      });
      onSaved(updated);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save video details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-video-heading"
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-float"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="edit-video-heading" className="flex items-center gap-2 text-lg font-extrabold text-card-foreground">
            <Pencil size={18} className="text-primary" aria-hidden="true" /> Edit video details
          </h2>
          <button
            type="button"
            disabled={saving || thumbnailUploading}
            onClick={onClose}
            aria-label="Close editor"
            className="flex size-10 items-center justify-center rounded-xl border border-border text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Update details for your {post.format === "short" ? "Short" : "video"} anytime.
        </p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <section aria-label="Video thumbnail" className="rounded-xl border border-border bg-background p-3">
            <h3 className="text-sm font-extrabold text-foreground">Thumbnail</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a frame from your saved video or upload a custom image. Save changes to apply it.
            </p>
            {(selectedFrame !== null || thumbnailUrl) && (
              <img
                src={selectedFrame !== null ? frames[selectedFrame] : thumbnailUrl}
                alt="Selected video thumbnail"
                className="mt-3 aspect-video w-full rounded-lg object-cover"
              />
            )}
            {framesLoading && (
              <p role="status" className="mt-3 text-xs text-muted-foreground">
                Extracting frames from saved video…
              </p>
            )}
            {frames.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {frames.map((frame, index) => (
                  <button
                    key={index}
                    type="button"
                    disabled={saving || thumbnailUploading}
                    onClick={() => {
                      setSelectedFrame(index);
                      setError("");
                    }}
                    aria-label={`Select thumbnail frame ${index + 1}`}
                    aria-pressed={selectedFrame === index}
                    className={`overflow-hidden rounded-lg border-2 ${selectedFrame === index ? "border-primary" : "border-border"} focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50`}
                  >
                    <img src={frame} alt={`Frame ${index + 1}`} className="aspect-video w-full object-cover" />
                    <span className="text-xs text-foreground">Frame {index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3">
              <genmb-uploader
                ref={uploaderRef}
                accept="image/*"
                folder="zivo-thumbnails"
                max-size="52428800"
                theme="dark"
                label="Upload custom thumbnail"
              />
            </div>
            {thumbnailUploading && (
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                Uploading custom thumbnail…
              </p>
            )}
          </section>
          <label htmlFor="video-edit-title" className="block text-xs font-bold text-card-foreground">
            Title
            <input
              id="video-edit-title"
              required
              maxLength={120}
              disabled={saving || thumbnailUploading}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </label>
          <label htmlFor="video-edit-description" className="block text-xs font-bold text-card-foreground">
            Description
            <textarea
              id="video-edit-description"
              maxLength={2000}
              rows={4}
              disabled={saving || thumbnailUploading}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </label>
          <label htmlFor="video-edit-tags" className="block text-xs font-bold text-card-foreground">
            Hashtags
            <input
              id="video-edit-tags"
              disabled={saving || thumbnailUploading}
              value={hashtags}
              onChange={(event) => setHashtags(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </label>
          <label htmlFor="video-edit-visibility" className="block text-xs font-bold text-card-foreground">
            Visibility
            <select
              id="video-edit-visibility"
              disabled={saving || thumbnailUploading}
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as StoredPost["visibility"])}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm text-card-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option>Public</option>
              <option>Unlisted</option>
              <option>Private</option>
              {visibility === "Followers" && <option>Followers</option>}
            </select>
          </label>
          {error && (
            <p role="alert" className="text-sm text-primary">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              disabled={saving || thumbnailUploading}
              onClick={onClose}
              className="min-h-11 rounded-xl border border-border text-sm font-bold text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || thumbnailUploading}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
