import { Clapperboard, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSmartShortPlan, type ZivoSmartShortIdea } from "../lib/smartShorts";
import type { StoredPost } from "../lib/posts";

function parseIdeas(response: string): ZivoSmartShortIdea[] {
  const clean = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error("The AI did not return usable Short suggestions. Please try again.");
  const ideas = parsed.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const idea = value as Record<string, unknown>;
    const hashtags = Array.isArray(idea.hashtags)
      ? idea.hashtags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
    if (
      typeof idea.hook !== "string" ||
      typeof idea.title !== "string" ||
      typeof idea.caption !== "string" ||
      typeof idea.suggestedDuration !== "string" ||
      typeof idea.suggestedClip !== "string"
    )
      return [];
    return [
      {
        id: typeof idea.id === "string" && idea.id.trim() ? idea.id.trim() : `idea-${index + 1}`,
        hook: idea.hook.trim(),
        title: idea.title.trim(),
        caption: idea.caption.trim(),
        hashtags,
        suggestedDuration: idea.suggestedDuration.trim(),
        suggestedClip: idea.suggestedClip.trim(),
      },
    ];
  });
  if (!ideas.length) throw new Error("The AI did not return usable Short suggestions. Please try again.");
  return ideas.slice(0, 3);
}

export default function SmartShortCreator({ post }: { post: StoredPost }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<ZivoSmartShortIdea[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (isAnalyzing || isCreating) return;
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current
      ?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled])")
      ?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        ),
      );
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? index <= 0
          ? controls.length - 1
          : index - 1
        : index === controls.length - 1
          ? 0
          : index + 1;
      event.preventDefault();
      controls[next].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, isAnalyzing, isCreating]);

  const selectIdea = (idea: ZivoSmartShortIdea) => {
    setSelectedId(idea.id);
    setTitle(idea.title);
    setCaption(idea.caption);
    setHashtags(idea.hashtags.join(" "));
  };

  const analyze = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    setError("");
    try {
      const source = [post.title, post.caption, post.description, post.hashtags.join(" ")].filter(Boolean).join("\n");
      const response = await window.genmb.ai.complete(
        `You are ZIVO Smart Video. Use only the following creator-provided long-form video metadata; you cannot inspect the video file or claim timestamps. Suggest exactly 3 distinct, editable Short concepts. Each needs a strong hook, accurate title, caption, 3-6 relevant hashtags, suggestedDuration such as "20–30 sec", and suggestedClip described as a creator-selected topic or segment, not a confirmed clip. Return ONLY JSON: [{"id":"idea-1","hook":"","title":"","caption":"","hashtags":["#tag"],"suggestedDuration":"","suggestedClip":""}].\n\nMetadata:\n${source || "No metadata was supplied."}`,
        { maxTokens: 850 },
      );
      const nextIdeas = parseIdeas(response);
      setIdeas(nextIdeas);
      selectIdea(nextIdeas[0]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Smart suggestions could not be generated.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createPlan = async () => {
    const selected = ideas.find((idea) => idea.id === selectedId);
    if (!selected || isCreating) return;
    if (!title.trim() || !caption.trim()) {
      setError("Add a title and caption before continuing to the normal Short publishing flow.");
      return;
    }
    setIsCreating(true);
    setError("");
    try {
      const plan = await createSmartShortPlan({
        creatorId: post.creatorId,
        sourceVideoId: post.id,
        idea: {
          ...selected,
          title: title.trim(),
          caption: caption.trim(),
          hashtags: hashtags.split(/\s+/).filter(Boolean),
        },
      });
      navigate("/create", { state: { smartShortPlanId: plan.id } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to prepare this Short.");
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-accent px-4 text-sm font-extrabold text-card-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Clapperboard size={17} className="text-primary" aria-hidden="true" /> Make a Short
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-short-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-float"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Smart Video</p>
                <h2 id="smart-short-title" className="mt-1 text-lg font-extrabold text-card-foreground">
                  Make a Short
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={isAnalyzing || isCreating}
                aria-label="Close Smart Short creator"
                className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Suggestions use your title, caption, description, and hashtags. This environment cannot analyze or trim
              video files, so no clip is created automatically.
            </p>
            {!ideas.length ? (
              <button
                type="button"
                onClick={() => void analyze()}
                disabled={isAnalyzing}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isAnalyzing ? (
                  <LoaderCircle className="zivo-loader" size={17} aria-hidden="true" />
                ) : (
                  <Sparkles size={17} aria-hidden="true" />
                )}
                {isAnalyzing ? "Finding ideas…" : "Generate Short ideas"}
              </button>
            ) : (
              <>
                <div className="mt-4 space-y-2">
                  {ideas.map((idea) => (
                    <button
                      key={idea.id}
                      type="button"
                      onClick={() => selectIdea(idea)}
                      aria-pressed={selectedId === idea.id}
                      className={`w-full rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === idea.id ? "border-primary bg-accent" : "border-border bg-background"}`}
                    >
                      <p className="text-xs font-extrabold text-primary">
                        {idea.suggestedDuration} · {idea.suggestedClip}
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-card-foreground">{idea.title}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">Hook: {idea.hook}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <label className="block text-xs font-extrabold text-card-foreground">
                    Short title
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs font-extrabold text-card-foreground">
                    Caption
                    <textarea
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      rows={3}
                      className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs font-extrabold text-card-foreground">
                    Hashtags
                    <input
                      value={hashtags}
                      onChange={(event) => setHashtags(event.target.value)}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void createPlan()}
                  disabled={isCreating}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <Clapperboard size={17} aria-hidden="true" /> {isCreating ? "Preparing…" : "Create Short"}
                </button>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-primary/45 bg-background px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
