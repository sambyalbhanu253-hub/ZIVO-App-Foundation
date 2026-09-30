import {
  ArrowLeft,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Eye,
  FileText,
  Heart,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Save,
  Settings2,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ZivoEmptyState, ZivoErrorState, ZivoLoadingState } from "../components/ZivoState";
import EditVideoDetailsDialog from "../components/EditVideoDetailsDialog";
import {
  commentPrefix,
  deleteCommentForContentOwner,
  readComment,
  type ZivoComment,
} from "../hooks/usePersistentComments";
import { followPrefix, readFollowRelationship } from "../hooks/useFollowedCreators";
import usePageMeta from "../hooks/usePageMeta";
import { filterCreatorAnalytics, loadCreatorAnalytics, type CreatorAnalyticsSnapshot } from "../lib/creatorAnalytics";
import { loadNotifications, type ZivoNotification } from "../lib/notifications";
import { deleteCreatorPost, setCreatorPostFeatured, updateCreatorPost, type StoredPost } from "../lib/posts";
import { cn } from "../lib/utils";

type StudioSection = "home" | "content" | "comments" | "audience" | "earnings" | "settings";
type ContentFilter = "all" | "photo" | "short" | "video";
type CreatorSettings = { defaultVisibility: "Public" | "Followers" | "Private"; updatedAt: number };
type ReceivedComment = { comment: ZivoComment; post: StoredPost; contentType: "post" | "short" };

const sections: Array<{ id: StudioSection; label: string; icon: typeof Clapperboard }> = [
  { id: "home", label: "Home", icon: Clapperboard },
  { id: "content", label: "Content", icon: FileText },
  { id: "comments", label: "Comments", icon: MessageCircle },
  { id: "audience", label: "Audience", icon: Users },
  { id: "earnings", label: "Earnings", icon: CircleDollarSign },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function settingsKey(userId: string) {
  return `zivo:creator-settings:${userId}`;
}

function readSettings(value: unknown): CreatorSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { defaultVisibility: "Public", updatedAt: 0 };
  const candidate = value as Record<string, unknown>;
  return {
    defaultVisibility: ["Public", "Followers", "Private"].includes(String(candidate.defaultVisibility))
      ? (candidate.defaultVisibility as CreatorSettings["defaultVisibility"])
      : "Public",
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0,
  };
}

function contentLabel(post: StoredPost) {
  return post.format === "short" ? "Short" : post.format === "video" ? "Video" : "Post";
}

function contentRoute(post: StoredPost) {
  return post.format === "short" ? `/shorts/${encodeURIComponent(post.id)}` : `/content/${encodeURIComponent(post.id)}`;
}

function contentTypeFor(post: StoredPost): "post" | "short" {
  return post.format === "short" ? "short" : "post";
}

function publishedDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(timestamp),
  );
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function CreatorStudioPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<StudioSection>("home");
  const [filter, setFilter] = useState<ContentFilter>("all");
  const [snapshot, setSnapshot] = useState<CreatorAnalyticsSnapshot | null>(null);
  const [comments, setComments] = useState<ReceivedComment[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followActivity, setFollowActivity] = useState<ZivoNotification[]>([]);
  const [settings, setSettings] = useState<CreatorSettings>({ defaultVisibility: "Public", updatedAt: 0 });
  const [selectedPost, setSelectedPost] = useState<StoredPost | null>(null);
  const [editVideo, setEditVideo] = useState<StoredPost | null>(null);
  const [editor, setEditor] = useState<{
    title: string;
    description: string;
    hashtags: string;
    visibility: StoredPost["visibility"];
  }>({ title: "", description: "", hashtags: "", visibility: "Public" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [featuringId, setFeaturingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredPost | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  usePageMeta("Creator Studio | ZIVO", "Manage your own ZIVO content, audience, earnings, and creator settings.");

  const loadStudio = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const nextSnapshot = await loadCreatorAnalytics(user.id);
      const [following, notifications, rawSettings] = await Promise.all([
        window.genmb.kv.list(followPrefix(user.id)),
        loadNotifications(user.id),
        window.genmb.kv.get(settingsKey(user.id)),
      ]);
      const creatorPosts = nextSnapshot.posts.map((entry) => entry.post);
      const commentLists = await Promise.all(
        creatorPosts.map(async (post) => {
          const contentType = contentTypeFor(post);
          const result = await window.genmb.kv.list(commentPrefix(contentType, post.id));
          return result.data
            .map((entry) => readComment(entry.value, contentType, post.id))
            .filter((comment): comment is ZivoComment => Boolean(comment))
            .map((comment) => ({ comment, post, contentType }));
        }),
      );
      const followingIds = new Set(
        following.data
          .map((entry) => readFollowRelationship(entry.value))
          .filter((relationship) => relationship?.followerId === user.id)
          .map((relationship) => relationship!.targetId),
      );
      setSnapshot(nextSnapshot);
      setComments(commentLists.flat().sort((first, second) => second.comment.createdAt - first.comment.createdAt));
      setFollowingCount(followingIds.size);
      setFollowActivity(notifications.filter((notification) => notification.kind === "follow").slice(0, 6));
      setSettings(readSettings(rawSettings));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Creator Studio.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void loadStudio();
  }, [authLoading, loadStudio, user]);

  const metrics = useMemo(() => (snapshot ? filterCreatorAnalytics(snapshot, "all") : null), [snapshot]);
  const posts = useMemo(() => snapshot?.posts.map((entry) => entry.post) ?? [], [snapshot]);
  const visiblePosts = useMemo(
    () => posts.filter((post) => filter === "all" || post.format === filter),
    [filter, posts],
  );
  const counts = useMemo(
    () => ({
      total: posts.length,
      posts: posts.filter((post) => post.format === "photo").length,
      shorts: posts.filter((post) => post.format === "short").length,
      videos: posts.filter((post) => post.format === "video").length,
    }),
    [posts],
  );
  const metricById = useMemo(() => new Map(metrics?.content.map((item) => [item.id, item]) ?? []), [metrics]);
  const earnings = snapshot?.earnings.filter((record) => record.status !== "reversed") ?? [];
  const earningsByCurrency = useMemo(
    () =>
      Object.entries(
        earnings.reduce<Record<string, number>>((sum, record) => {
          sum[record.currency] = (sum[record.currency] || 0) + record.amount;
          return sum;
        }, {}),
      ),
    [earnings],
  );

  const openEditor = (post: StoredPost) => {
    setSelectedPost(post);
    setEditor({
      title: post.title || "",
      description: post.description || "",
      hashtags: post.hashtags.join(" "),
      visibility: post.visibility,
    });
    setNotice("");
    setError("");
  };

  const saveContent = async () => {
    if (!user || !selectedPost || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateCreatorPost({
        creatorId: user.id,
        postId: selectedPost.id,
        title: editor.title,
        description: editor.description,
        hashtags: editor.hashtags.split(/\s+/).filter(Boolean),
        visibility: editor.visibility,
      });
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((entry) => (entry.post.id === updated.id ? { ...entry, post: updated } : entry)),
            }
          : current,
      );
      setSelectedPost(updated);
      setNotice("Content changes saved to your ZIVO account.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save content changes.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = async (post: StoredPost) => {
    if (!user || featuringId) return;
    setFeaturingId(post.id);
    setError("");
    setNotice("");
    try {
      const updated = await setCreatorPostFeatured({ creatorId: user.id, postId: post.id, featured: !post.featured });
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((entry) => ({
                ...entry,
                post:
                  entry.post.id === post.id
                    ? updated
                    : entry.post.featured
                      ? { ...entry.post, featured: false }
                      : entry.post,
              })),
            }
          : current,
      );
      setNotice(updated.featured ? "Video featured on your profile." : "Video removed from featured.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update featured video.");
    } finally {
      setFeaturingId(null);
    }
  };

  const deleteContent = async () => {
    if (!user || !deleteTarget || deletingId) return;
    setDeletingId(deleteTarget.id);
    setError("");
    try {
      await deleteCreatorPost({ creatorId: user.id, postId: deleteTarget.id });
      setSnapshot((current) =>
        current ? { ...current, posts: current.posts.filter((entry) => entry.post.id !== deleteTarget.id) } : current,
      );
      setComments((current) => current.filter((item) => item.post.id !== deleteTarget.id));
      if (selectedPost?.id === deleteTarget.id) setSelectedPost(null);
      setNotice("Content deleted from your ZIVO creator archive.");
      setDeleteTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete this content.");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteComment = async (item: ReceivedComment) => {
    if (!user || deletingId) return;
    setDeletingId(item.comment.id);
    setError("");
    try {
      await deleteCommentForContentOwner({
        creatorId: user.id,
        contentId: item.post.id,
        contentType: item.contentType,
        commentId: item.comment.id,
      });
      setComments((current) => current.filter((entry) => entry.comment.id !== item.comment.id));
      setSnapshot((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((entry) =>
                entry.post.id === item.post.id
                  ? {
                      ...entry,
                      comments: entry.comments.filter(
                        (comment) => comment.contentId !== item.post.id || comment.createdAt !== item.comment.createdAt,
                      ),
                    }
                  : entry,
              ),
            }
          : current,
      );
      setNotice("Comment removed from your content.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove this comment.");
    } finally {
      setDeletingId(null);
    }
  };

  const saveSettings = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError("");
    try {
      const next = { ...settings, updatedAt: Date.now() };
      await window.genmb.kv.set(settingsKey(user.id), next);
      setSettings(next);
      setNotice("Creator visibility preference saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save creator settings.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <ZivoLoadingState label="Loading your Creator Studio…" />;
  if (!user)
    return (
      <ZivoEmptyState
        title="Creator Studio is private"
        description="Sign in to manage content, comments, audience, earnings, and settings for your own ZIVO account."
        action={{ label: "Sign in", onClick: () => navigate("/sign-in") }}
      />
    );
  if (!snapshot || !metrics)
    return (
      <ZivoErrorState
        title="Creator Studio unavailable"
        description={error || "Your private creator workspace could not be opened."}
        action={{ label: "Back to profile", onClick: () => navigate("/profile") }}
      />
    );

  const recentPosts = posts.slice(0, 3);
  const renderContentCard = (post: StoredPost, compact = false) => {
    const metric = metricById.get(post.id);
    return (
      <article key={post.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-premium">
        <div className="flex gap-3 p-3">
          <div className={cn("w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted", post.format === "short" ? "aspect-[9/16]" : "aspect-video")} >
            {post.mediaType === "video" ? (
              post.thumbnailUrl ? <img src={post.thumbnailUrl} alt={`${post.title || post.caption} thumbnail`} className="size-full object-cover" /> : <video
                src={post.mediaUrl}
                preload="metadata"
                muted
                playsInline
                className="size-full object-cover"
                aria-label={`${post.mediaAlt} preview`}
              />
            ) : (
              <img
                data-genmb-img={post.mediaAlt}
                src={post.mediaRef}
                alt={post.mediaAlt}
                className="size-full object-cover"
                onError={(event) => {
                  event.currentTarget.src = `https://picsum.photos/seed/zivo-studio-${post.id}/160/160`;
                }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-accent px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">
                  {contentLabel(post)}
                </span>
                <h3 className="mt-1 truncate text-sm font-extrabold text-card-foreground">
                  {post.title || post.caption || "Untitled content"}
                </h3>
              </div>
              <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
                {post.featured ? "Featured · " : ""}
                {post.visibility === "Unlisted" ? "Unlisted draft" : post.visibility}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{publishedDate(post.createdAt)}</p>
            <div className="mt-2 flex items-center gap-3 text-xs font-bold text-muted-foreground">
              <span>
                <Heart size={13} className="mr-1 inline text-primary" />
                {metric?.likes ?? 0}
              </span>
              <span>
                <MessageCircle size={13} className="mr-1 inline text-primary" />
                {metric?.comments ?? 0}
              </span>
              <span>
                <Save size={13} className="mr-1 inline text-primary" />
                {metric?.saves ?? 0}
              </span>
            </div>
          </div>
        </div>
        {post.mediaType === "video" && (
          <button
            type="button"
            onClick={() => {
              setEditVideo(post);
              setError("");
              setNotice("");
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-border px-3 text-xs font-extrabold text-primary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil size={16} aria-hidden="true" /> Edit video details
          </button>
        )}
        {post.mediaType === "video" && (
          <button
            type="button"
            disabled={Boolean(featuringId) || (post.visibility !== "Public" && !post.featured)}
            onClick={() => void toggleFeatured(post)}
            className="min-h-11 w-full border-t border-border px-3 text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {featuringId === post.id ? "Updating…" : post.featured ? "Remove from Featured" : "Set as Featured"}
          </button>
        )}
        {!compact && (
          <div className="grid grid-cols-2 border-t border-border">
            <button
              type="button"
              onClick={() => navigate(contentRoute(post))}
              className="min-h-11 border-r border-border text-xs font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open details
            </button>
            <button
              type="button"
              onClick={() => openEditor(post)}
              className="min-h-11 text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Manage
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="zivo-screen" aria-labelledby="creator-studio-title">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="zivo-icon-button flex size-10 items-center justify-center border border-border bg-card text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to profile"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">ZIVO creator tools</p>
          <h1 id="creator-studio-title" className="mt-1 text-2xl font-extrabold tracking-[-0.065em] text-foreground">
            Creator Studio
          </h1>
        </div>
      </div>
      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className="mt-4 rounded-xl border border-primary/40 bg-accent px-3 py-2.5 text-xs font-semibold text-card-foreground"
        >
          {error || notice}
        </p>
      )}

      <div
        className="zivo-scroll-row -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1"
        role="tablist"
        aria-label="Creator Studio sections"
      >
        {sections.map((item) => {
          const Icon = item.icon;
          const selected = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-premium"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      {section === "home" && (
        <div className="mt-5 space-y-5" role="tabpanel">
          <div className="rounded-3xl border border-primary/35 bg-gradient-to-br from-accent via-card to-card p-5 shadow-premium">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator overview</p>
            <h2 className="mt-2 text-xl font-extrabold tracking-[-0.055em] text-card-foreground">
              Your publishing workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage your real ZIVO content and audience from one private creator dashboard.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                [counts.total, "Total content", FileText],
                [counts.posts, "Posts", Eye],
                [counts.shorts, "Shorts", Clapperboard],
                [counts.videos, "Videos", Video],
              ].map(([value, label, Icon]) => {
                const MetricIcon = Icon as typeof FileText;
                return (
                  <div key={String(label)} className="rounded-xl border border-border/80 bg-background/45 p-3">
                    <MetricIcon size={16} className="text-primary" />
                    <p className="mt-3 text-2xl font-extrabold tracking-[-0.06em] text-card-foreground">
                      {value as number}
                    </p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">{label as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Recent content</p>
              <h2 className="mt-1 text-lg font-extrabold text-foreground">Latest published</h2>
            </div>
            <button
              type="button"
              onClick={() => setSection("content")}
              className="text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View all
            </button>
          </div>
          {recentPosts.length ? (
            <div className="space-y-2">{recentPosts.map((post) => renderContentCard(post, true))}</div>
          ) : (
            <ZivoEmptyState
              title="Your creator archive is empty"
              description="Publish a post, Short, or video to begin managing it here."
              action={{ label: "Create content", onClick: () => navigate("/create") }}
            />
          )}
          <button
            type="button"
            onClick={() => navigate("/creator/analytics")}
            className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 text-left shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
                <BarChart3 size={18} />
              </span>
              <span>
                <span className="block text-sm font-extrabold text-card-foreground">Simple Creator Analytics</span>
                <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                  Open your existing analytics dashboard
                </span>
              </span>
            </span>
            <ChevronRight size={18} className="text-primary" />
          </button>
        </div>
      )}

      {section === "content" && (
        <div className="mt-5" role="tabpanel">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">My content</p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">Content & unlisted drafts</h2>
          </div>
          <div
            className="mt-4 grid grid-cols-4 gap-1.5 rounded-2xl border border-border bg-card p-1.5"
            role="tablist"
            aria-label="Content filters"
          >
            {(["all", "photo", "short", "video"] as ContentFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                onClick={() => setFilter(item)}
                className={cn(
                  "min-h-10 rounded-xl px-1 text-xs font-extrabold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {item === "photo" ? "Posts" : item}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">
            {visiblePosts.length} {visiblePosts.length === 1 ? "item" : "items"} · Unlisted uploads can be edited here
            before making them public.
          </p>
          {visiblePosts.length ? (
            <div className="mt-3 space-y-2">{visiblePosts.map((post) => renderContentCard(post))}</div>
          ) : (
            <ZivoEmptyState
              title="No content in this filter"
              description="Try another filter or create something new for your archive."
              action={{ label: "Create content", onClick: () => navigate("/create") }}
            />
          )}
        </div>
      )}

      {section === "comments" && (
        <div className="mt-5" role="tabpanel">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Comments management</p>
          <h2 className="mt-1 text-lg font-extrabold text-foreground">Received on your content</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Review comments across your posts, Shorts, and videos. Removing a comment only affects content you own.
          </p>
          {comments.length ? (
            <div className="mt-4 space-y-2">
              {comments.map((item) => (
                <article key={item.comment.id} className="rounded-2xl border border-border bg-card p-3 shadow-premium">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-card-foreground">{item.comment.author.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                        {item.comment.author.username} · {publishedDate(item.comment.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={deletingId === item.comment.id}
                      onClick={() => void deleteComment(item)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      aria-label="Remove comment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-card-foreground">{item.comment.text}</p>
                  <button
                    type="button"
                    onClick={() => navigate(contentRoute(item.post))}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open {contentLabel(item.post)} <ChevronRight size={14} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <ZivoEmptyState
              title="No comments received yet"
              description="When viewers comment on your published content, you can review it here."
            />
          )}
        </div>
      )}

      {section === "audience" && (
        <div className="mt-5 space-y-4" role="tabpanel">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator audience</p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">Your community</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
              <Users size={18} className="text-primary" />
              <p className="mt-3 text-2xl font-extrabold tracking-[-0.06em] text-card-foreground">
                {metrics.followerCount}
              </p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">Followers</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
              <Users size={18} className="text-primary" />
              <p className="mt-3 text-2xl font-extrabold tracking-[-0.06em] text-card-foreground">{followingCount}</p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">Following</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-extrabold text-card-foreground">Recent follower activity</p>
            {followActivity.length ? (
              <div className="mt-3 space-y-2">
                {followActivity.map((item) => (
                  <article
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-premium"
                  >
                    <img
                      data-genmb-img={`${item.actor.name} avatar`}
                      src={item.actor.avatar}
                      alt=""
                      className="size-10 rounded-xl object-cover"
                      onError={(event) => {
                        event.currentTarget.src = `https://picsum.photos/seed/zivo-follower-${item.actor.id}/80/80`;
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-card-foreground">{item.actor.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                        Started following you · {publishedDate(item.createdAt)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-premium">
                <p className="text-sm font-extrabold text-card-foreground">No recent follower activity</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  New follows will appear here when your existing notification data records them.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {section === "earnings" && (
        <div className="mt-5 space-y-4" role="tabpanel">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Earnings</p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">Monetization foundation</h2>
          </div>
          <div className="rounded-3xl border border-primary/35 bg-gradient-to-br from-accent via-card to-card p-5 shadow-premium">
            <CircleDollarSign size={22} className="text-primary" />
            {earningsByCurrency.length ? (
              <div className="mt-4 space-y-2">
                {earningsByCurrency.map(([currency, total]) => (
                  <p key={currency} className="text-3xl font-extrabold tracking-[-0.07em] text-card-foreground">
                    {money(total, currency)}{" "}
                    <span className="text-xs font-semibold text-muted-foreground">recorded</span>
                  </p>
                ))}
              </div>
            ) : (
              <>
                <p className="mt-4 text-3xl font-extrabold tracking-[-0.07em] text-card-foreground">$0.00</p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">No earnings yet</p>
              </>
            )}
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Only verified earning records appear here. ZIVO does not estimate or invent revenue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/creator/monetization")}
            className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 text-left shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              <span className="block text-sm font-extrabold text-card-foreground">Open monetization</span>
              <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                Program status and private earning history
              </span>
            </span>
            <ChevronRight size={18} className="text-primary" />
          </button>
        </div>
      )}

      {section === "settings" && (
        <div className="mt-5 space-y-3" role="tabpanel">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator settings</p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">Your workspace preferences</h2>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-premium">
            <label htmlFor="studio-default-visibility" className="text-sm font-extrabold text-card-foreground">
              Default content visibility
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Saved as a preference for your creator workspace. Existing content keeps its own visibility until you edit
              it.
            </p>
            <select
              id="studio-default-visibility"
              value={settings.defaultVisibility}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  defaultVisibility: event.target.value as CreatorSettings["defaultVisibility"],
                }))
              }
              disabled={saving}
              className="mt-3 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-bold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option>Public</option>
              <option>Followers</option>
              <option>Private</option>
            </select>
            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="zivo-loader" size={17} /> : <Check size={17} />}
              {saving ? "Saving…" : "Save preference"}
            </button>
          </div>
          {[
            ["Creator profile", "Edit your public profile and bio", "/profile", Pencil],
            ["Notification preferences", "Review your existing ZIVO notifications", "/notifications", Bell],
            ["Account & security", "Manage your signed-in account and sign out", "/profile", Settings2],
          ].map(([title, description, route, Icon]) => {
            const RowIcon = Icon as typeof Pencil;
            return (
              <button
                key={String(title)}
                type="button"
                onClick={() => navigate(route as string)}
                className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-border bg-card px-4 text-left shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-primary">
                    <RowIcon size={17} />
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-card-foreground">{title as string}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                      {description as string}
                    </span>
                  </span>
                </span>
                <ChevronRight size={18} className="text-primary" />
              </button>
            );
          })}
        </div>
      )}

      {editVideo && (
        <EditVideoDetailsDialog
          key={editVideo.id}
          post={editVideo}
          creatorId={user.id}
          onClose={() => setEditVideo(null)}
          onSaved={(updated) => {
            setSnapshot((current) =>
              current
                ? {
                    ...current,
                    posts: current.posts.map((entry) =>
                      entry.post.id === updated.id ? { ...entry, post: updated } : entry,
                    ),
                  }
                : current,
            );
            if (selectedPost?.id === updated.id) setSelectedPost(updated);
            setNotice("Video details saved to your ZIVO account.");
          }}
        />
      )}
      {selectedPost && (
        <section
          className="mt-6 rounded-3xl border border-primary/35 bg-card p-4 shadow-float"
          aria-labelledby="content-editor-title"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Content management</p>
              <h2 id="content-editor-title" className="mt-1 text-lg font-extrabold text-card-foreground">
                Edit {contentLabel(selectedPost)}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPost(null)}
              className="text-xs font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Close
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <label htmlFor="studio-title" className="block text-xs font-extrabold text-card-foreground">
              Title
              <input
                id="studio-title"
                value={editor.title}
                onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
                maxLength={120}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </label>
            <label htmlFor="studio-description" className="block text-xs font-extrabold text-card-foreground">
              Description
              <textarea
                id="studio-description"
                value={editor.description}
                onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))}
                maxLength={2000}
                rows={3}
                className="mt-1.5 w-full resize-none rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-medium text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </label>
            <label htmlFor="studio-hashtags" className="block text-xs font-extrabold text-card-foreground">
              Hashtags
              <input
                id="studio-hashtags"
                value={editor.hashtags}
                onChange={(event) => setEditor((current) => ({ ...current, hashtags: event.target.value }))}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </label>
            <label htmlFor="studio-visibility" className="block text-xs font-extrabold text-card-foreground">
              Visibility
              <select
                id="studio-visibility"
                value={editor.visibility}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, visibility: event.target.value as StoredPost["visibility"] }))
                }
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
              >
                <option>Public</option>
                <option>Unlisted</option>
                <option>Followers</option>
                <option>Private</option>
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                Unlisted videos are available by direct link, but not in feeds or public profiles.
              </span>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void saveContent()}
              disabled={saving}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(selectedPost)}
              disabled={saving}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/50 bg-accent px-3 text-sm font-extrabold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </section>
      )}

      {deleteTarget && (
        <section
          className="mt-4 rounded-2xl border border-primary/50 bg-accent p-4 shadow-premium"
          aria-labelledby="delete-content-title"
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Confirmation required</p>
          <h2 id="delete-content-title" className="mt-1 text-base font-extrabold text-card-foreground">
            Delete this {contentLabel(deleteTarget).toLowerCase()}?
          </h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            This permanently removes “{deleteTarget.title || deleteTarget.caption || "Untitled content"}” from your ZIVO
            content archive. This cannot be undone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(deletingId)}
              onClick={() => setDeleteTarget(null)}
              className="min-h-11 rounded-xl border border-border px-3 text-sm font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(deletingId)}
              onClick={() => void deleteContent()}
              className="min-h-11 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {deletingId ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
