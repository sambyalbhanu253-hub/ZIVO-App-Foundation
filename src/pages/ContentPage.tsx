import { ArrowLeft, Clapperboard, Languages, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import CommentThread from "../components/CommentThread";
import ContentShareActions from "../components/ContentShareActions";
import SafetyMenu from "../components/SafetyMenu";
import CreatorPostMenu from "../components/CreatorPostMenu";
import LongFormVideoPlayer from "../components/LongFormVideoPlayer";
import SmartShortCreator from "../components/SmartShortCreator";
import { ZivoErrorState, ZivoLoadingState } from "../components/ZivoState";
import usePageMeta from "../hooks/usePageMeta";
import {
  languageLabel,
  loadContentLanguageSettings,
  saveContentLanguageSettings,
  type ZivoContentLanguageSettings,
} from "../lib/contentLanguages";
import { loadPost, type StoredPost } from "../lib/posts";

export default function ContentPage() {
  const { contentId = "" } = useParams<{ contentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState<StoredPost | null>(null);
  const [languages, setLanguages] = useState<ZivoContentLanguageSettings | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("original");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [languageStatus, setLanguageStatus] = useState("");
  const [error, setError] = useState("");

  usePageMeta(post ? `${post.creatorName} on ZIVO` : "ZIVO content", "Watch and share ZIVO content.");

  useEffect(() => {
    let active = true;
    const loadContent = async () => {
      setIsLoading(true);
      setError("");
      try {
        const loaded = await loadPost(contentId);
        if (!active) return;
        setPost(loaded);
        setLanguages(loaded ? await loadContentLanguageSettings(loaded.id, loaded.creatorId) : null);
        if (!loaded) setError("This ZIVO content is unavailable or has been removed.");
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load this ZIVO content.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadContent();
    return () => {
      active = false;
    };
  }, [contentId]);

  const displayed = useMemo(() => {
    const translation = languages?.translations.find((item) => item.languageCode === selectedLanguage);
    return translation
      ? {
          title: translation.title || post?.title || "",
          caption: translation.caption || post?.caption || "",
          description: translation.description || post?.description || "",
        }
      : { title: post?.title || "", caption: post?.caption || "", description: post?.description || "" };
  }, [languages, post, selectedLanguage]);

  const removeTranslation = async (languageCode: string) => {
    if (!post || !languages || !user || user.id !== post.creatorId || isSavingLanguage) return;
    setIsSavingLanguage(true);
    setLanguageStatus("");
    try {
      const saved = await saveContentLanguageSettings({
        ...languages,
        translations: languages.translations.filter((item) => item.languageCode !== languageCode),
        updatedAt: Date.now(),
      });
      setLanguages(saved);
      setSelectedLanguage("original");
      setLanguageStatus(`${languageLabel(languageCode)} translation removed. Original content was not changed.`);
    } catch (caughtError) {
      setLanguageStatus(caughtError instanceof Error ? caughtError.message : "Unable to remove this translation.");
    } finally {
      setIsSavingLanguage(false);
    }
  };

  if (isLoading) return <ZivoLoadingState label="Opening ZIVO content…" />;
  if (!post)
    return (
      <ZivoErrorState
        title="Content unavailable"
        description={error}
        action={{ label: "Back to Home", onClick: () => (window.location.hash = "#/") }}
      />
    );
  if (post.format === "short") return <Navigate to={`/shorts/${encodeURIComponent(post.id)}`} replace />;

  const mediaUrl = post.mediaUrl || post.mediaRef;
  const isLongVideo = post.format === "video" && post.mediaType === "video";
  const availableAudio =
    languages?.dubbingVersions.filter((version) => version.status === "ready" && version.mediaRef) ?? [];
  const isCreator = user?.id === post.creatorId;

  return (
    <section className="zivo-screen -mx-5 -mt-6 pb-4" aria-labelledby="content-title">
      <div className="sticky top-[76px] z-10 flex items-center gap-3 border-b border-border/70 bg-background/90 px-5 py-3 backdrop-blur-2xl">
        <Link
          to="/"
          aria-label="Back to Home"
          className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={19} aria-hidden="true" />
        </Link>
        <p className="text-sm font-extrabold text-foreground">ZIVO content</p>
      </div>
      <article className="mx-auto max-w-md overflow-hidden border-b border-border/70 bg-card">
        <div className="flex items-center gap-3 px-5 py-4">
          <img
            data-genmb-img={`${post.creatorName} creator profile`}
            src={post.creatorAvatar}
            alt={`${post.creatorName} profile`}
            className="size-11 rounded-full border border-border object-cover"
            onError={(event) => {
              event.currentTarget.src = `https://picsum.photos/seed/zivo-content-${post.id}-avatar/96/96`;
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-card-foreground">{post.creatorName}</p>
            <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
              {post.post_type === 'channel' ? post.category : `${post.creatorHandle} · ${post.category}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ContentShareActions
              contentId={post.id}
              format={post.format}
              title={post.title || post.caption}
              creatorName={post.creatorName}
              isPublic={post.visibility === "Public"}
            />
            <CreatorPostMenu postId={post.id} creatorId={post.creatorId} title={post.title || post.caption || 'Post'} onDeleted={() => navigate('/')} />
            <SafetyMenu targetType={post.format === "video" ? "video" : "post"} targetId={post.id} targetOwnerId={post.creatorId} targetName={post.creatorName} />
          </div>
        </div>
        <div className={isLongVideo ? "bg-muted p-2" : post.mediaType === "video" ? "relative aspect-video overflow-hidden bg-muted" : "relative aspect-[4/5] overflow-hidden bg-muted"}>
          {isLongVideo ? (
            <LongFormVideoPlayer src={mediaUrl} poster={post.thumbnailUrl} title={post.title || post.caption || `${post.creatorName}'s video`} />
          ) : post.mediaType === "video" ? (
            <video
              src={mediaUrl}
              poster={post.thumbnailUrl}
              controls
              playsInline
              preload="metadata"
              className="size-full bg-background object-contain"
              aria-label={post.mediaAlt}
            />
          ) : (
            <img
              data-genmb-img={post.mediaAlt}
              src={mediaUrl}
              alt={post.mediaAlt}
              className="size-full object-cover"
              onError={(event) => {
                event.currentTarget.src = `https://picsum.photos/seed/zivo-content-${post.id}-fallback/900/1125`;
              }}
            />
          )}
          {post.mediaType !== "video" && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/65 px-3 py-1.5 text-xs font-extrabold text-foreground backdrop-blur-md">
              <Clapperboard size={14} aria-hidden="true" /> {post.duration}
            </span>
          )}
        </div>
        <div className="px-5 py-4">
          {languages && (
            <div className="mb-4 rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-card-foreground">
                <Languages size={15} className="text-primary" aria-hidden="true" /> Language
              </div>
              <label className="sr-only" htmlFor="viewer-language">
                Choose content language
              </label>
              <select
                id="viewer-language"
                value={selectedLanguage}
                onChange={(event) => setSelectedLanguage(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              >
                <option value="original">Original · {languageLabel(languages.originalLanguageCode)}</option>
                {languages.translations.map((translation) => (
                  <option key={translation.languageCode} value={translation.languageCode}>
                    {languageLabel(translation.languageCode)} text
                  </option>
                ))}
              </select>
              {availableAudio.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">No alternate audio is available for this content.</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <h1 id="content-title" className="text-base font-extrabold text-card-foreground">
              {displayed.title || displayed.caption}
            </h1>
            {isLongVideo && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-card-foreground">
                <Play size={12} fill="currentColor" aria-hidden="true" /> Video
              </span>
            )}
          </div>
          {displayed.title && displayed.caption && (
            <p className="mt-2 text-sm font-semibold text-card-foreground">{displayed.caption}</p>
          )}
          {displayed.description && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{displayed.description}</p>
          )}
          {post.hashtags.length > 0 && <p className="mt-2 text-xs font-bold text-primary">{post.hashtags.join(" ")}</p>}
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            Published{" "}
            {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
              new Date(post.createdAt),
            )}
          </p>
          {isCreator && isLongVideo && <SmartShortCreator post={post} />}
          {isCreator && languages && (
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-extrabold text-card-foreground">Creator language versions</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Dubbing is unavailable because this deployment has no configured speech or media-processing provider. No
                audio has been generated.
              </p>
              {languages.translations.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No saved translations yet. Create one from Creator Tools before publishing, or publish a new
                  translated version through a future editor.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {languages.translations.map((translation) => (
                    <div
                      key={translation.languageCode}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <span className="text-xs font-bold text-card-foreground">
                        {languageLabel(translation.languageCode)}
                      </span>
                      <button
                        type="button"
                        disabled={isSavingLanguage}
                        onClick={() => void removeTranslation(translation.languageCode)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 text-xs font-extrabold text-muted-foreground transition hover:bg-muted disabled:opacity-60"
                      >
                        <Trash2 size={13} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {languageStatus && (
                <p role="status" className="mt-3 text-xs font-semibold text-primary">
                  {languageStatus}
                </p>
              )}
            </div>
          )}
          <CommentThread
            contentId={post.id}
            contentType="post"
            contentOwnerId={post.creatorId}
            contentPreview={mediaUrl}
          />
        </div>
      </article>
    </section>
  );
}
