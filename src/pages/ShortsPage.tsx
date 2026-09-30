import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Bookmark, Heart, MessageCircle, Music2 } from "lucide-react";
import useFollowedCreators from "../hooks/useFollowedCreators";
import usePageMeta from "../hooks/usePageMeta";
import useVideoEngagement from "../hooks/useVideoEngagement";
import usePersistentLikes from "../hooks/usePersistentLikes";
import useSafetyRelationships from "../hooks/useSafetyRelationships";
import SafetyMenu from "../components/SafetyMenu";
import CommentThread from "../components/CommentThread";
import ContentShareActions from "../components/ContentShareActions";
import { ZivoEmptyState, ZivoErrorState, ZivoLoadingState } from "../components/ZivoState";
import { useAuth } from "../auth/AuthProvider";
import { actorFromUser, createNotification } from "../lib/notifications";
import { loadPost, loadPosts, localPostUpdatedEvent, type StoredPost } from "../lib/posts";
import { profileUpdatedEvent } from "../lib/profiles";
import { cn } from "../lib/utils";

type Short = {
  id: string;
  creator: string;
  handle: string;
  avatar: string;
  image: string;
  imageSubject: string;
  caption: string;
  title?: string;
  description?: string;
  hashtags: string[];
  sound: string;
  likes: number;
  comments: number;
  shares: number;
  commentPreview: string;
  ownerId: string;
  isVideo?: boolean;
  isPublic: boolean;
};

const demoShorts: Short[] = [
  {
    id: "golden-hour-run",
    creator: "Maya Chen",
    handle: "@mayamoves",
    avatar: "https://picsum.photos/seed/zivo-maya-avatar/96/96",
    image:
      "https://images.pexels.com/photos/8283485/pexels-photo-8283485.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageSubject: "golden hour city run",
    caption: "A little movement, a little sunlight, and the whole day changes.",
    hashtags: ["#goldenhour", "#runclub", "#citylife"],
    sound: "Original sound · Maya Chen",
    likes: 18400,
    comments: 326,
    shares: 812,
    commentPreview: "This is your sign to step outside today ✨",
    ownerId: "creator:maya-chen",
    isPublic: false,
  },
  {
    id: "ceramic-morning",
    creator: "Jon Bell",
    handle: "@jonmakes",
    avatar: "https://picsum.photos/seed/zivo-jon-avatar/96/96",
    image:
      "https://images.pexels.com/photos/37827264/pexels-photo-37827264.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageSubject: "ceramic studio morning",
    caption: "The quietest part of the studio is always my favorite.",
    hashtags: ["#ceramics", "#slowmorning", "#maker"],
    sound: "Daylight Loop · Nami",
    likes: 9320,
    comments: 198,
    shares: 421,
    commentPreview: "The texture on that glaze is unreal.",
    ownerId: "creator:jon-bell",
    isPublic: false,
  },
  {
    id: "weekend-table",
    creator: "Sofia Reyes",
    handle: "@sofiaseasons",
    avatar: "https://picsum.photos/seed/zivo-sofia-avatar/96/96",
    image:
      "https://images.pexels.com/photos/12932171/pexels-photo-12932171.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageSubject: "weekend dinner table",
    caption: "Proof that a great night can start with a table full of color.",
    hashtags: ["#weekendvibes", "#tablescape", "#friends"],
    sound: "Lemonade Skies · Willa",
    likes: 26700,
    comments: 504,
    shares: 1100,
    commentPreview: "Saving this color palette for my next dinner.",
    ownerId: "creator:sofia-reyes",
    isPublic: false,
  },
];

function shortFromStored(post: StoredPost): Short {
  return {
    id: post.id,
    creator: post.creatorName,
    handle: post.creatorHandle,
    avatar: post.creatorAvatar,
    image: post.mediaUrl || post.mediaRef,
    imageSubject: post.mediaAlt,
    caption: post.caption,
    title: post.title,
    description: post.description,
    hashtags: post.hashtags,
    sound: post.sound || `Original sound · ${post.creatorName}`,
    likes: post.engagement.likeCount,
    comments: post.engagement.commentCount,
    shares: 0,
    commentPreview: "Be the first to share what you think.",
    ownerId: post.creatorId,
    isVideo: post.mediaType === "video",
    isPublic: post.visibility === "Public",
  };
}

function formatCount(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(".0", "")}K`;
  return String(count);
}

export default function ShortsPage() {
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [expandedDescription, setExpandedDescription] = useState<string | null>(null);
  const [persistedCommentCounts, setPersistedCommentCounts] = useState<Record<string, number>>({});
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [persistedShorts, setPersistedShorts] = useState<Short[]>([]);
  const [isShortsLoading, setIsShortsLoading] = useState(true);
  const [shortsError, setShortsError] = useState("");
  const [videoProgress, setVideoProgress] = useState<Record<string, number>>({});

  const handleInteractionTouch = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && (event.target as HTMLElement).closest("button")) {
      navigator.vibrate?.(8);
    }
  };

  const { user } = useAuth();
  const { contentId } = useParams<{ contentId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  usePageMeta("ZIVO Shorts — Premium Social Video", "Watch short-form video moments on ZIVO.");
  const {
    followedCreatorIds,
    isLoading: isFollowsLoading,
    updatingCreatorId,
    error: followError,
    toggleFollow,
  } = useFollowedCreators();
  const { hiddenUserIds, reload: reloadSafety } = useSafetyRelationships();
  const {
    savedIds: savedShorts,
    isLoading: isEngagementLoading,
    isUpdating: isEngagementUpdating,
    error: engagementError,
    toggleSave,
  } = useVideoEngagement();

  const feedShorts = useMemo(() => {
    if (contentId) return persistedShorts.filter((short) => short.id === contentId && !hiddenUserIds.includes(short.ownerId));
    const uniqueShorts = new Map<string, Short>();
    for (const short of [...persistedShorts, ...demoShorts]) {
      if (!uniqueShorts.has(short.id)) uniqueShorts.set(short.id, short);
    }
    return [...uniqueShorts.values()].filter((short) => !hiddenUserIds.includes(short.ownerId));
  }, [contentId, hiddenUserIds, persistedShorts]);

  const {
    likedIds: likedShorts,
    likeCounts,
    isLoading: isLikesLoading,
    updatingId: updatingLikeId,
    error: likesError,
    toggleLike,
  } = usePersistentLikes(feedShorts.map((short) => ({ id: short.id, contentType: "short" as const })));

  const loadPersistedShorts = useCallback(async () => {
    setIsShortsLoading(true);
    setShortsError("");
    try {
      if (contentId) {
        const selectedPost = await loadPost(contentId);
        if (!selectedPost || selectedPost.format !== "short") {
          setPersistedShorts([]);
          setShortsError("This ZIVO Short is unavailable or has been removed.");
          return;
        }
        setPersistedShorts([shortFromStored(selectedPost)]);
        return;
      }
      const loadedPosts = await loadPosts();
      const uniqueShorts = new Map<string, Short>();
      loadedPosts
        .filter((post) => post.format === "short")
        .map(shortFromStored)
        .forEach((short) => uniqueShorts.set(short.id, short));
      setPersistedShorts([...uniqueShorts.values()]);
    } catch (error) {
      setShortsError(error instanceof Error ? error.message : "Unable to load published Shorts right now.");
    } finally {
      setIsShortsLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    void loadPersistedShorts();
    window.addEventListener(profileUpdatedEvent, loadPersistedShorts);
    return () => window.removeEventListener(profileUpdatedEvent, loadPersistedShorts);
  }, [loadPersistedShorts, location.key]);

  useEffect(() => {
    const onPostUpdated = (event: Event) => {
      const post = (event as CustomEvent<StoredPost>).detail;
      if (!post || post.format !== "short") return;
      setPersistedShorts((current) => {
        if (post.visibility !== "Public" && (!contentId || post.id !== contentId)) return current.filter((short) => short.id !== post.id);
        if (contentId && post.id !== contentId) return current;
        const updated = shortFromStored(post);
        return current.some((short) => short.id === post.id)
          ? current.map((short) => short.id === post.id ? updated : short)
          : [updated, ...current];
      });
    };
    window.addEventListener(localPostUpdatedEvent, onPostUpdated);
    return () => window.removeEventListener(localPostUpdatedEvent, onPostUpdated);
  }, [contentId]);

  const updateShortCommentCount = useCallback((shortId: string, count: number) => {
    setPersistedCommentCounts((current) => (current[shortId] === count ? current : { ...current, [shortId]: count }));
  }, []);

  const handleFollow = async (short: Short) => {
    const result = await toggleFollow(short.ownerId);
    if (!result) return;
    if (result.persisted && result.following && user) {
      try {
        await createNotification({
          dedupeId: `follow:${user.id}:${short.ownerId}`,
          kind: "follow",
          recipientId: short.ownerId,
          actor: await actorFromUser(user),
          message: "started following you.",
        });
      } catch (caughtError) {
        setShareStatus(
          `Following ${short.creator}. Saved to your account, but the notification could not be sent: ${caughtError instanceof Error ? caughtError.message : "unknown error"}`,
        );
        return;
      }
    }
    setShareStatus(
      result.persisted
        ? `${result.following ? "Following" : "Unfollowed"} ${short.creator}. Saved to your account.`
        : `${result.following ? "Following" : "Unfollowed"} ${short.creator} for this session. Sign in to save it.`,
    );
  };

  const handleLike = async (short: Short) => {
    const result = await toggleLike({ id: short.id, contentType: "short" });
    if (!result) return;
    if (result.requiresAuth) {
      setShareStatus("Sign in to like shorts.");
      navigate("/sign-in");
      return;
    }
    if (result.liked && user) {
      try {
        await createNotification({
          dedupeId: `like:${user.id}:${short.id}`,
          kind: "like",
          recipientId: short.ownerId,
          actor: await actorFromUser(user),
          contentId: short.id,
          contentType: "short",
          contentPreview: short.image,
          message: `liked your short “${short.caption}”`,
        });
      } catch (caughtError) {
        setShareStatus(
          `Liked ${short.creator}'s short, but the notification could not be sent: ${caughtError instanceof Error ? caughtError.message : "unknown error"}`,
        );
        return;
      }
    }
    setShareStatus(`${result.liked ? "Liked" : "Unliked"} ${short.creator}'s short. Saved to your account.`);
  };

  const handleSave = async (short: Short) => {
    const result = await toggleSave({
      id: short.id,
      contentType: "short",
      creator: short.creator,
      title: short.title || short.caption,
      image: short.image,
      imageAlt: `${short.creator}'s short video cover`,
      views: formatCount(short.likes),
    });
    if (!result) return;
    if (result.requiresAuth) {
      setShareStatus("Sign in to save shorts.");
      navigate("/sign-in");
      return;
    }
    setShareStatus(
      `${result.selected ? "Saved" : "Removed"} ${short.creator}'s short ${result.selected ? "to" : "from"} your saved items.`,
    );
  };

  if (isShortsLoading && persistedShorts.length === 0) {
    return (
      <section className="zivo-screen px-5 pt-6">
        <ZivoLoadingState label="Loading published Shorts…" />
      </section>
    );
  }

  if (shortsError && feedShorts.length === 0) {
    return (
      <section className="zivo-screen px-5 pt-6">
        <ZivoErrorState
          title="Published Shorts could not load."
          description={shortsError}
          action={{ label: "Try again", onClick: () => void loadPersistedShorts() }}
        />
      </section>
    );
  }

  if (!isShortsLoading && feedShorts.length === 0) {
    return (
      <section className="zivo-screen px-5 pt-6">
        <ZivoEmptyState
          title={contentId ? "Short unavailable" : "No Shorts yet"}
          description={contentId ? "This ZIVO Short is no longer available." : "Published Shorts from the ZIVO community will appear here."}
          action={{ label: "Create a Short", onClick: () => navigate("/create") }}
        />
      </section>
    );
  }

  return (
    <section className="zivo-screen relative" aria-label="ZIVO Shorts feed">
      <p className="sr-only">Swipe up to browse ZIVO Shorts.</p>
      {shareStatus && (
        <p className="sr-only" role="status">
          {shareStatus}
        </p>
      )}
      {(followError || engagementError || likesError || shortsError) && (
        <p
          role="alert"
          className="absolute left-5 right-5 top-4 z-20 mx-auto max-w-md rounded-2xl border border-primary/45 bg-accent px-4 py-3 text-sm font-semibold text-card-foreground shadow-premium"
        >
          {followError || engagementError || likesError || `Published Shorts could not refresh: ${shortsError}`}
        </p>
      )}

      <div className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain bg-background [scrollbar-width:none]">
        {feedShorts.map((short) => {
          const isLiked = likedShorts.includes(short.id);
          const isSaved = savedShorts.includes(short.id);
          const isFollowing = followedCreatorIds.includes(short.ownerId);
          const commentsAreOpen = openComments === short.id;

          return (
            <article
              key={short.id}
              className="zivo-media-overlay relative isolate h-dvh snap-start snap-always overflow-hidden bg-card"
              aria-label={`Short by ${short.creator}`}
            >
              {short.isVideo ? (
                <video
                  src={short.image}
                  aria-label={short.imageSubject}
                  autoPlay
                  controls
                  muted={false}
                  loop
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    if (Number.isFinite(video.duration) && video.duration > 0) {
                      const progress = Math.min(100, (video.currentTime / video.duration) * 100);
                      setVideoProgress((current) => current[short.id] === progress ? current : { ...current, [short.id]: progress });
                    }
                  }}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setVideoProgress((current) => ({ ...current, [short.id]: video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0 }));
                  }}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <img
                  data-genmb-img={short.imageSubject}
                  src={short.image}
                  alt={`${short.creator}'s short video cover`}
                  className="absolute inset-0 size-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.opacity = "0";
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/25 via-transparent via-45% to-background" />
              <div className="zivo-shorts-caption-shade pointer-events-none absolute inset-x-0 bottom-0 h-[72%]" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/25 via-transparent to-background/15" />

              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pt-[calc(max(env(safe-area-inset-top),1.5rem)+0.75rem)]">
                <span className="inline-block rounded-full bg-background/35 px-3 py-1.5 text-sm font-bold text-foreground backdrop-blur-sm">Shorts</span>
              </div>

              <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+2rem)] left-5 right-[5rem] max-h-[55%] overflow-y-auto [scrollbar-width:none]">
                <div className="mb-3 flex items-center gap-2.5">
                  <img
                    data-genmb-img={`${short.creator} avatar`}
                    src={short.avatar}
                    alt=""
                    className="size-10 rounded-full border-2 border-card object-cover object-center shadow-premium"
                    onError={(event) => {
                      event.currentTarget.style.opacity = "0";
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-foreground">{short.creator}</p>
                    <p className="text-xs font-medium text-foreground/75">{short.handle}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleFollow(short)}
                      disabled={isFollowsLoading || updatingCreatorId === short.ownerId}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]",
                        isFollowing
                          ? "border border-border bg-background/65 text-foreground backdrop-blur-md"
                          : "bg-primary text-primary-foreground shadow-premium",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                      aria-pressed={isFollowing}
                    >
                      {updatingCreatorId === short.ownerId ? "Saving…" : isFollowing ? "Following" : "Follow"}
                    </button>
                    <SafetyMenu targetType="short" targetId={short.id} targetOwnerId={short.ownerId} targetName={short.creator} onSafetyChange={() => void reloadSafety()} />
                  </div>
                </div>
                {short.title && (
                  <h2 className="text-base font-extrabold leading-6 text-foreground [text-shadow:0_1px_12px_var(--background)]">{short.title}</h2>
                )}
                {short.description ? (
                  <div className="mt-1 text-sm font-medium leading-5 text-foreground [text-shadow:0_1px_12px_var(--background)]">
                    <p className={expandedDescription === short.id ? "whitespace-pre-wrap break-words" : "line-clamp-2 break-words"}>{short.description}</p>
                    {short.description.length > 90 && (
                      <button type="button" onClick={() => setExpandedDescription((current) => current === short.id ? null : short.id)}
                        aria-expanded={expandedDescription === short.id}
                        aria-label={`${expandedDescription === short.id ? "Show less of" : "Show more of"} ${short.title || short.creator}'s description`}
                        className="mt-1 rounded-md font-bold text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {expandedDescription === short.id ? "Show less" : "More"}
                      </button>
                    )}
                  </div>
                ) : (!short.title || short.caption !== short.title) && (
                  <p className="mt-1 text-sm font-semibold leading-5 text-foreground [text-shadow:0_1px_12px_var(--background)]">{short.caption}</p>
                )}
                <p className="mt-1.5 text-xs font-bold text-primary [text-shadow:0_1px_12px_var(--background)]">
                  {short.hashtags.join(" ")}
                </p>
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-border/45 bg-background/45 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur-md">
                  <Music2 size={14} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{short.sound}</span>
                </div>
              </div>

              <div className="zivo-shorts-actions absolute bottom-[calc(env(safe-area-inset-bottom)+2rem)] right-3 flex flex-col items-center gap-2" onPointerDownCapture={handleInteractionTouch}>
                <ActionButton
                  label={isLiked ? "Unlike" : "Like"}
                  count={formatCount(short.likes + (likeCounts[short.id] ?? 0))}
                  pressed={isLiked}
                  onClick={() => void handleLike(short)}
                  disabled={isLikesLoading || updatingLikeId === short.id}
                  icon={<Heart size={22} fill={isLiked ? "currentColor" : "none"} aria-hidden="true" />}
                />
                <ActionButton
                  label="View comments"
                  count={formatCount(short.comments + (persistedCommentCounts[short.id] ?? 0))}
                  pressed={commentsAreOpen}
                  onClick={() => setOpenComments((current) => (current === short.id ? null : short.id))}
                  icon={<MessageCircle size={22} aria-hidden="true" />}
                />
                <ContentShareActions
                  className="shorts-share-actions"
                  contentId={short.id}
                  format="short"
                  title={short.title || short.caption}
                  creatorName={short.creator}
                  isPublic={short.isPublic}
                  shareCount={formatCount(short.shares)}
                  layout="column"
                />
                <ActionButton
                  label={isSaved ? "Remove from saved" : "Save"}
                  pressed={isSaved}
                  onClick={() => void handleSave(short)}
                  disabled={isEngagementLoading || isEngagementUpdating}
                  icon={<Bookmark size={22} fill={isSaved ? "currentColor" : "none"} aria-hidden="true" />}
                />
              </div>

              {short.isVideo && (
                <div className="zivo-shorts-progress pointer-events-none absolute inset-x-4 bottom-1.5 h-0.5 overflow-visible rounded-full" role="progressbar" aria-label={`Playback progress for ${short.title || short.creator}'s short`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(videoProgress[short.id] ?? 0)}>
                  <div className="zivo-shorts-progress-fill h-full rounded-full" style={{ width: `${videoProgress[short.id] ?? 0}%` }} />
                </div>
              )}

              {commentsAreOpen && (
                <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+2rem)] left-5 right-[5rem]">
                  <CommentThread
                    contentId={short.id}
                    contentType="short"
                    compact
                    samplePreview={short.commentPreview}
                    contentOwnerId={short.ownerId}
                    contentPreview={short.image}
                    onCountChange={(count) => updateShortCommentCount(short.id, count)}
                  />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

type ActionButtonProps = {
  label: string;
  count?: string;
  pressed?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

function ActionButton({ label, count, pressed, icon, onClick, disabled = false }: ActionButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "zivo-shorts-action flex size-11 items-center justify-center rounded-full border border-border/60 bg-background/55 text-foreground shadow-premium backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
          pressed && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {icon}
      </button>
      {count && (
        <span className="text-[11px] font-extrabold text-foreground [text-shadow:0_1px_8px_var(--background)]">
          {count}
        </span>
      )}
    </div>
  );
}
