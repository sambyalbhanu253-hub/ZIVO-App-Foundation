import { ArrowLeft, Check, Compass, ImagePlus, Plus, Search, Send, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ZivoEmptyState, ZivoErrorState, ZivoInlineLoader, ZivoLoadingState } from "../components/ZivoState";
import {
  createCommunity,
  joinCommunity,
  leaveCommunity,
  loadCommunities,
  loadCommunity,
  loadCommunityMemberships,
  normalizeCommunitySlug,
  type ZivoCommunity,
} from "../lib/communities";
import { createCommunityPost, loadCommunityPosts, type ZivoCommunityPost, type ZivoCommunityPostMedia } from "../lib/communityPosts";
import { profileKey, readStoredProfile } from "../lib/profiles";

function communityAvatar(community: ZivoCommunity) {
  return (
    community.avatarUrl || `https://picsum.photos/seed/zivo-community-${encodeURIComponent(community.slug)}/160/160`
  );
}

function memberLabel(count: number) {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

type CommunityPostView = ZivoCommunityPost & {
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string;
};

function timeAgo(timestamp: number) {
  const difference = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CommunitiesPage() {
  const { user, loading: authLoading } = useAuth();
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const uploaderRef = useRef<HTMLElement>(null);
  const postUploaderRef = useRef<HTMLElement>(null);
  const postSubmittingRef = useRef(false);
  const isCreatePage = location.pathname === "/communities/create";
  const isDetailPage = Boolean(slug) && !isCreatePage;
  const [communities, setCommunities] = useState<ZivoCommunity[]>([]);
  const [community, setCommunity] = useState<ZivoCommunity | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [isMember, setIsMember] = useState(false);
  const [ownerName, setOwnerName] = useState("ZIVO creator");
  const [communityPosts, setCommunityPosts] = useState<CommunityPostView[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [isPostSaving, setIsPostSaving] = useState(false);
  const [postError, setPostError] = useState("");
  const [postStatus, setPostStatus] = useState("");
  const [postDraft, setPostDraft] = useState<{ text: string; media?: ZivoCommunityPostMedia }>({ text: "" });
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMembershipSaving, setIsMembershipSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({ name: "", slug: "", description: "", avatarUrl: "" });

  const refreshDirectory = async () => {
    setIsLoading(true);
    setError("");
    try {
      setCommunities(await loadCommunities());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load communities.");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDetail = async (communitySlug: string, viewerId?: string) => {
    setIsLoading(true);
    setError("");
    try {
      const nextCommunity = await loadCommunity(communitySlug);
      if (!nextCommunity) {
        setCommunity(null);
        return;
      }
      setIsPostsLoading(true);
      const [members, rawOwnerProfile, posts] = await Promise.all([
        loadCommunityMemberships(nextCommunity.slug),
        window.genmb.kv.get(profileKey(nextCommunity.ownerId)),
        loadCommunityPosts(nextCommunity.slug),
      ]);
      const authorProfiles = await Promise.all(
        posts.map(async (post) => [post.authorUserId, readStoredProfile(await window.genmb.kv.get(post.authorProfileRef))] as const),
      );
      const profilesByUserId = new Map(authorProfiles);
      const ownerProfile = readStoredProfile(rawOwnerProfile);
      setCommunity(nextCommunity);
      setMemberCount(new Set([...members.map((member) => member.userId), nextCommunity.ownerId]).size);
      setIsMember(Boolean(viewerId && (nextCommunity.ownerId === viewerId || members.some((member) => member.userId === viewerId))));
      setOwnerName(ownerProfile?.displayName || "ZIVO creator");
      setCommunityPosts(posts.map((post) => {
        const authorProfile = profilesByUserId.get(post.authorUserId);
        return {
          ...post,
          authorName: authorProfile?.displayName || "ZIVO member",
          authorUsername: authorProfile?.username || "@zivo.member",
          authorAvatarUrl: authorProfile?.avatarUrl || `https://picsum.photos/seed/zivo-community-author-${encodeURIComponent(post.authorUserId)}/96/96`,
        };
      }));
      setPostError("");
      setIsPostsLoading(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load this community.");
      setCommunityPosts([]);
      setPostError("");
    } finally {
      setIsPostsLoading(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (isDetailPage && slug) {
      void refreshDetail(slug, user?.id);
      return;
    }
    if (!isCreatePage) void refreshDirectory();
    else setIsLoading(false);
  }, [authLoading, isCreatePage, isDetailPage, slug, user?.id]);

  useEffect(() => {
    const uploader = uploaderRef.current;
    if (!uploader) return;
    const handleComplete = (event: Event) => {
      const files = (event as CustomEvent<{ files?: Array<{ url?: string }> }>).detail?.files || [];
      const url = files[0]?.url;
      if (url) {
        setDraft((current) => ({ ...current, avatarUrl: url }));
        setStatus("Community avatar uploaded. It will be saved when you create the community.");
      }
    };
    const handleError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setError(message || "The community avatar could not be uploaded.");
    };
    uploader.addEventListener("genmb-upload-complete", handleComplete);
    uploader.addEventListener("genmb-upload-error", handleError);
    return () => {
      uploader.removeEventListener("genmb-upload-complete", handleComplete);
      uploader.removeEventListener("genmb-upload-error", handleError);
    };
  }, [isCreatePage]);

  useEffect(() => {
    const uploader = postUploaderRef.current;
    if (!uploader || !isDetailPage) return;
    const handleComplete = (event: Event) => {
      const files = (event as CustomEvent<{ files?: Array<{ url?: string; filename?: string; contentType?: string }> }>).detail?.files || [];
      const file = files[0];
      if (file?.url) {
        setPostDraft((current) => ({
          ...current,
          media: { url: file.url, filename: file.filename, contentType: file.contentType || "application/octet-stream" },
        }));
        setPostStatus("Media is ready to include with your post.");
      }
    };
    const handleError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      setPostError(message || "Your post media could not be uploaded.");
    };
    uploader.addEventListener("genmb-upload-complete", handleComplete);
    uploader.addEventListener("genmb-upload-error", handleError);
    return () => {
      uploader.removeEventListener("genmb-upload-complete", handleComplete);
      uploader.removeEventListener("genmb-upload-error", handleError);
    };
  }, [isDetailPage]);

  const submitCommunityPost = async () => {
    if (!community || postSubmittingRef.current || isPostSaving) return;
    if (!user) {
      navigate("/sign-in");
      return;
    }
    if (!isMember && user.id !== community.ownerId) {
      setPostError("Join this community before sharing a post.");
      return;
    }

    postSubmittingRef.current = true;
    setIsPostSaving(true);
    setPostError("");
    try {
      await createCommunityPost({
        communityId: community.slug,
        authorUserId: user.id,
        text: postDraft.text,
        media: postDraft.media,
      });
      setPostDraft({ text: "" });
      await refreshDetail(community.slug, user.id);
      setPostStatus("Your community post is live.");
    } catch (caughtError) {
      setPostError(caughtError instanceof Error ? caughtError.message : "Unable to publish your community post.");
    } finally {
      postSubmittingRef.current = false;
      setIsPostSaving(false);
    }
  };

  const filteredCommunities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return communities;
    return communities.filter((item) =>
      `${item.name} ${item.slug} ${item.description}`.toLowerCase().includes(normalized),
    );
  }, [communities, query]);

  const submitCommunity = async () => {
    if (!user || isSaving) {
      if (!user) navigate("/sign-in");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const created = await createCommunity({ ...draft, ownerId: user.id });
      setStatus(`${created.name} was created and you are its first member.`);
      navigate(`/communities/${created.slug}`, {
        replace: true,
        state: { communityStatus: `${created.name} was created and you are its first member.` },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create this community.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMembership = async () => {
    if (!community || isMembershipSaving) return;
    if (!user) {
      navigate("/sign-in");
      return;
    }
    setIsMembershipSaving(true);
    setError("");
    try {
      const result = isMember
        ? await leaveCommunity(community.slug, user.id)
        : await joinCommunity(community.slug, user.id);
      await refreshDetail(result.community.slug, user.id);
      const membershipChanged = ("joined" in result && result.joined) || ("left" in result && result.left);
      const membershipAction = "joined" in result && result.joined ? "Joined" : "Left";
      setStatus(
        membershipChanged
          ? `${membershipAction} ${result.community.name}. Your membership has been saved.`
          : `You are already a member of ${result.community.name}.`,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update your membership.");
    } finally {
      setIsMembershipSaving(false);
    }
  };

  if (authLoading || isLoading) return <ZivoLoadingState label="Loading ZIVO communities…" />;

  if (isCreatePage) {
    return (
      <section className="zivo-screen" aria-labelledby="page-title">
        <button
          type="button"
          onClick={() => navigate("/communities")}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={16} aria-hidden="true" /> Communities
        </button>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">Start a space</p>
        <h1 id="page-title" className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground">
          Create a community.
        </h1>
        <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
          Bring people together around the videos, ideas, and culture they care about.
        </p>
        {!user && (
          <ZivoEmptyState
            className="mt-5"
            title="Sign in to create"
            description="Your ZIVO account is needed to own and manage a community."
            action={{ label: "Sign in", onClick: () => navigate("/sign-in") }}
          />
        )}
        {user && (
          <form
            className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-premium"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCommunity();
            }}
          >
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-primary/45 bg-accent px-3 py-2.5 text-sm font-semibold text-card-foreground"
              >
                {error}
              </p>
            )}
            <div>
              <label htmlFor="community-name" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Community name
              </label>
              <input
                id="community-name"
                value={draft.name}
                disabled={isSaving}
                maxLength={60}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                className="min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="community-slug" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Unique identifier
              </label>
              <div className="flex min-h-11 items-center rounded-xl border border-border bg-muted px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm font-bold text-muted-foreground">zivo/</span>
                <input
                  id="community-slug"
                  value={draft.slug}
                  disabled={isSaving}
                  maxLength={40}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, slug: normalizeCommunitySlug(event.target.value) }))
                  }
                  className="min-w-0 flex-1 bg-transparent pl-1 text-sm font-semibold text-card-foreground outline-none disabled:opacity-60"
                />
              </div>
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                3–40 lowercase letters, numbers, or hyphens.
              </p>
            </div>
            <div>
              <label htmlFor="community-description" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                Description
              </label>
              <textarea
                id="community-description"
                value={draft.description}
                disabled={isSaving}
                rows={4}
                maxLength={500}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                className="w-full resize-none rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-medium leading-6 text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
              <p className="mt-1 text-right text-xs font-medium text-muted-foreground">
                {draft.description.length}/500
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                Community avatar <span className="font-medium">(optional)</span>
              </p>
              <genmb-uploader
                ref={uploaderRef}
                accept="image/*"
                folder="community-avatars"
                max-size="52428800"
                theme="dark"
                label="Add community avatar"
              ></genmb-uploader>
              {draft.avatarUrl && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted p-2">
                  <img
                    data-genmb-img="Community avatar preview"
                    src={draft.avatarUrl}
                    alt="Community avatar preview"
                    className="size-11 rounded-lg object-cover"
                  />
                  <span className="text-xs font-semibold text-muted-foreground">Avatar ready to save</span>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={17} aria-hidden="true" />
              {isSaving ? "Creating…" : "Create community"}
            </button>
          </form>
        )}
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
      </section>
    );
  }

  if (isDetailPage) {
    if (!community)
      return (
        <ZivoErrorState
          title="Community unavailable"
          description={error || "This community does not exist or its record is invalid."}
          action={{ label: "Browse communities", onClick: () => navigate("/communities") }}
        />
      );
    const isOwner = user?.id === community.ownerId;
    const createdStatus = (location.state as { communityStatus?: string } | null)?.communityStatus;
    return (
      <section className="zivo-screen" aria-labelledby="page-title">
        <Link
          to="/communities"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl text-xs font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={16} aria-hidden="true" /> All communities
        </Link>
        {error && (
          <ZivoErrorState
            className="mt-3 text-left"
            title="Something needs attention"
            description={error}
            action={{ label: "Try again", onClick: () => void refreshDetail(community.slug, user?.id) }}
          />
        )}
        {createdStatus && (
          <p
            role="status"
            className="mt-3 rounded-xl border border-primary/45 bg-accent px-3 py-2.5 text-sm font-semibold text-card-foreground"
          >
            {createdStatus}
          </p>
        )}
        <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-premium">
          <div className="h-24 bg-gradient-to-br from-primary/60 via-accent to-background" />
          <div className="px-5 pb-5">
            <img
              data-genmb-img={`${community.name} community avatar`}
              src={communityAvatar(community)}
              alt={`${community.name} community avatar`}
              className="-mt-10 size-20 rounded-2xl border-4 border-card object-cover shadow-premium"
              onError={(event) => {
                event.currentTarget.src = `https://picsum.photos/seed/zivo-community-${community.slug}-fallback/160/160`;
              }}
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-primary">zivo/{community.slug}</p>
            <h1 id="page-title" className="mt-1 text-2xl font-extrabold tracking-[-0.055em] text-card-foreground">
              {community.name}
            </h1>
            <p className="mt-3 text-sm font-medium leading-6 text-muted-foreground">{community.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-card-foreground">{memberLabel(memberCount)}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Created by {ownerName}</p>
              </div>
              {isOwner ? (
                <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/40 bg-accent px-3 text-xs font-extrabold text-card-foreground">
                  <Check size={15} aria-hidden="true" /> Owner
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void toggleMembership()}
                  disabled={isMembershipSaving}
                  className="min-h-10 rounded-xl bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isMembershipSaving ? "Saving…" : isMember ? "Leave" : "Join community"}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-premium">
          <UsersRound size={19} className="text-primary" aria-hidden="true" />
          <h2 className="mt-2 text-base font-extrabold text-card-foreground">Community posts</h2>
          <p className="mt-1.5 text-sm font-medium leading-6 text-muted-foreground">
            Share with the members shaping this ZIVO space.
          </p>
          {postStatus && (
            <p role="status" className="mt-3 rounded-xl border border-primary/45 bg-accent px-3 py-2.5 text-sm font-semibold text-card-foreground">
              {postStatus}
            </p>
          )}

          {user && isMember && (
            <form
              className="mt-4 space-y-3 rounded-2xl border border-border bg-muted p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitCommunityPost();
              }}
            >
              <label htmlFor="community-post-caption" className="block text-xs font-bold text-muted-foreground">
                Share with {community.name}
              </label>
              <textarea
                id="community-post-caption"
                value={postDraft.text}
                disabled={isPostSaving}
                rows={3}
                maxLength={1000}
                onChange={(event) => setPostDraft((current) => ({ ...current, text: event.target.value }))}
                placeholder="Start a conversation…"
                className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium leading-6 text-card-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
              <div>
                <p className="mb-1.5 text-xs font-bold text-muted-foreground">Media <span className="font-medium">(optional)</span></p>
                <genmb-uploader
                  ref={postUploaderRef}
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  folder="community-posts"
                  max-size="52428800"
                  theme="dark"
                  label="Add photo or video"
                ></genmb-uploader>
                {postDraft.media && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card p-2">
                    <ImagePlus size={16} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
                      {postDraft.media.filename || "Media ready to post"}
                    </span>
                    <button
                      type="button"
                      disabled={isPostSaving}
                      onClick={() => setPostDraft((current) => ({ ...current, media: undefined }))}
                      className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-extrabold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              {postError && (
                <p role="alert" className="rounded-xl border border-primary/45 bg-accent px-3 py-2.5 text-sm font-semibold text-card-foreground">
                  {postError}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">{postDraft.text.length}/1000</p>
                <button
                  type="submit"
                  disabled={isPostSaving || (!postDraft.text.trim() && !postDraft.media)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={15} aria-hidden="true" /> {isPostSaving ? "Posting…" : "Post"}
                </button>
              </div>
            </form>
          )}
          {!user && (
            <p className="mt-4 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-semibold text-muted-foreground">
              Sign in and join to share with this community.
            </p>
          )}
          {user && !isMember && (
            <p className="mt-4 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-semibold text-muted-foreground">
              Join this community to create a post.
            </p>
          )}
        </div>

        <div className="mt-5" aria-labelledby="community-posts-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="community-posts-title" className="text-base font-extrabold text-foreground">Latest posts</h2>
            {isPostsLoading && <ZivoInlineLoader label="Loading posts" />}
          </div>
          {postError && !isMember && (
            <ZivoErrorState
              className="mt-3 text-left"
              title="Posts need attention"
              description={postError}
              action={{ label: "Try again", onClick: () => void refreshDetail(community.slug, user?.id) }}
            />
          )}
          {!isPostsLoading && communityPosts.length === 0 && !postError && (
            <ZivoEmptyState
              className="mt-3"
              title="No posts yet"
              description={isMember ? "Be the first member to start the conversation." : "Join this community to see what members share next."}
            />
          )}
          <div className="mt-3 space-y-3">
            {communityPosts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-border bg-card p-4 shadow-premium">
                <div className="flex items-center gap-3">
                  <img
                    data-genmb-img={`${post.authorName} profile photo`}
                    src={post.authorAvatarUrl}
                    alt=""
                    className="size-10 rounded-xl border border-border object-cover"
                    onError={(event) => {
                      event.currentTarget.src = `https://picsum.photos/seed/zivo-community-author-${encodeURIComponent(post.authorUserId)}-fallback/96/96`;
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-card-foreground">{post.authorName}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{post.authorUsername} · {timeAgo(post.createdAt)}</p>
                  </div>
                </div>
                {post.text && <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-card-foreground">{post.text}</p>}
                {post.media && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted">
                    {post.media.contentType.startsWith("image/") ? (
                      <genmb-image src={post.media.url} width="800" alt={`Media shared by ${post.authorName}`}></genmb-image>
                    ) : (
                      <video className="block max-h-96 w-full bg-background" controls preload="metadata" src={post.media.url}>
                        Your browser does not support this community video.
                      </video>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {status} {postStatus}
        </p>
      </section>
    );
  }

  return (
    <section className="zivo-screen" aria-labelledby="page-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Find your people</p>
          <h1 id="page-title" className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground">
            Communities.
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
            Discover member-led spaces across ZIVO.
          </p>
        </div>
        <Link
          to="/communities/create"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={16} aria-hidden="true" /> Create
        </Link>
      </div>
      {error && (
        <ZivoErrorState
          className="mt-5 text-left"
          title="Communities could not load"
          description={error}
          action={{ label: "Try again", onClick: () => void refreshDirectory() }}
        />
      )}
      <div className="mt-5 flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-card px-3 shadow-premium focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
        <Search size={19} className="text-muted-foreground" aria-hidden="true" />
        <label htmlFor="community-search" className="sr-only">
          Search communities
        </label>
        <input
          id="community-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search communities"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-card-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      {filteredCommunities.length === 0 ? (
        <ZivoEmptyState
          className="mt-5"
          title={query ? "No communities match that search" : "No communities yet"}
          description={
            query
              ? "Try another name, identifier, or topic."
              : "Create the first ZIVO community and invite your people."
          }
          action={
            !query
              ? { label: "Create community", onClick: () => navigate("/communities/create") }
              : { label: "Clear search", onClick: () => setQuery("") }
          }
        />
      ) : (
        <div className="mt-5 space-y-3">
          {filteredCommunities.map((item) => (
            <Link
              key={item.id}
              to={`/communities/${item.slug}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-premium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                data-genmb-img={`${item.name} community avatar`}
                src={communityAvatar(item)}
                alt=""
                className="size-14 rounded-xl border border-border object-cover"
                onError={(event) => {
                  event.currentTarget.src = `https://picsum.photos/seed/zivo-community-${item.slug}-fallback/160/160`;
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-card-foreground">{item.name}</span>
                <span className="mt-0.5 block truncate text-xs font-bold text-primary">zivo/{item.slug}</span>
                <span className="mt-1 block line-clamp-2 text-xs font-medium leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <Compass size={18} className="shrink-0 text-primary" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
