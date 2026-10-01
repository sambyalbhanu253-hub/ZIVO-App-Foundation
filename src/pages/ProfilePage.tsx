import {
  BadgeCheck,
  BarChart3,
  Bookmark,
  Check,
  Clapperboard,
  ChevronRight,
  Eye,
  Grid3X3,
  Heart,
  LogOut,
  Pencil,
  Play,
  Trash2,
  Loader2,
  Pin,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import useFollowedCreators from "../hooks/useFollowedCreators";
import usePageMeta from "../hooks/usePageMeta";
import useVideoEngagement from "../hooks/useVideoEngagement";
import { ZivoEmptyState, ZivoErrorState, ZivoInlineLoader, ZivoLoadingState } from "../components/ZivoState";
import LongFormVideoPlayer from "../components/LongFormVideoPlayer";
import EditVideoDetailsDialog from "../components/EditVideoDetailsDialog";
import ContentShareActions from "../components/ContentShareActions";
import SafetyMenu from "../components/SafetyMenu";
import AvatarCropDialog from "../components/AvatarCropDialog";
import {
  deleteCreatorPost,
  loadPost,
  loadCreatorPosts,
  localPostPublishedEvent,
  localPostDeletedEvent,
  setCreatorPostFeatured,
  setCreatorPostVisibility,
  type PostVisibility,
  type StoredPost,
} from "../lib/posts";
import {
  fallbackProfile,
  isUsernameTaken,
  isValidUsername,
  normalizeUsername,
  profileKey,
  profileUpdatedEvent,
  readStoredProfile,
  type StoredProfile,
} from "../lib/profiles";
import { followPrefix, readFollowRelationship } from "../hooks/useFollowedCreators";
import { cn } from "../lib/utils";
import { validateText } from "../lib/textSafety";
import { loadCreatorMonetizationSettings, type MonetizationStatus } from "../lib/monetization";

type ProfileTab = "videos" | "shorts" | "saved";
type ProfileMedia = {
  id: string;
  format: StoredPost["format"];
  title: string;
  image: string;
  thumbnail?: string;
  imageAlt: string;
  views: string;
  duration: string;
  type: "videos" | "shorts";
  isVideo: boolean;
  isLongVideo: boolean;
  creatorName: string;
  creatorHandle: string;
  createdAt: number;
  isPublic: boolean;
  visibility: PostVisibility;
  featured?: boolean;
};

const profileTabs: Array<{ id: ProfileTab; label: string; icon: typeof Grid3X3 }> = [
  { id: "videos", label: "Videos", icon: Grid3X3 },
  { id: "shorts", label: "Shorts", icon: Clapperboard },
  { id: "saved", label: "Saved", icon: Bookmark },
];

function profileMediaFromPost(post: StoredPost): ProfileMedia {
  return {
    id: post.id,
    format: post.format,
    title: post.title || post.caption || "Untitled post",
    image: post.mediaType === "video" ? post.mediaUrl : post.mediaRef,
    thumbnail: post.thumbnailUrl,
    imageAlt: post.mediaAlt,
    views: "Views unavailable",
    duration: post.duration,
    type: post.format === "short" ? "shorts" : "videos",
    isVideo: post.mediaType === "video",
    isLongVideo: post.format === "video" && post.mediaType === "video",
    creatorName: post.creatorName,
    creatorHandle: post.creatorHandle,
    createdAt: post.createdAt,
    isPublic: post.visibility === "Public",
    visibility: post.visibility,
    featured: post.featured === true,
  };
}

function avatarFallback(userId: string) {
  return `https://picsum.photos/seed/zivo-profile-${encodeURIComponent(userId)}-avatar/240/240`;
}

function formatPublishedDate(createdAt: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(createdAt),
  );
}

export default function ProfilePage() {
  const { user, loading: isAuthLoading } = useAuth();
  const { userId: profileUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const profileId = profileUserId || user?.id || "";
  const isOwnProfile = Boolean(user && profileId === user.id);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [draft, setDraft] = useState({
    username: "",
    displayName: "",
    channelName: "",
    bio: "",
    avatarUrl: "",
    channelAvatarUrl: "",
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const channelUploaderRef = useRef<HTMLElement>(null);
  const [channelLogoUploading, setChannelLogoUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [media, setMedia] = useState<ProfileMedia[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ProfileTab>("videos");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [selectedLongVideo, setSelectedLongVideo] = useState<ProfileMedia | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfileMedia | null>(null);
  const [editPost, setEditPost] = useState<StoredPost | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [featuringId, setFeaturingId] = useState<string | null>(null);
  const [visibilityId, setVisibilityId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const [monetizationStatus, setMonetizationStatus] = useState<MonetizationStatus | null>(null);
  const videoDialogRef = useRef<HTMLDivElement>(null);
  const videoTriggerRef = useRef<HTMLButtonElement>(null);
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelLogoutRef = useRef<HTMLButtonElement>(null);
  const confirmLogoutRef = useRef<HTMLButtonElement>(null);
  const { followedCreatorIds, error: followError } = useFollowedCreators();
  const { savedItems, isLoading: savedLoading, error: savedError } = useVideoEngagement();

  usePageMeta(
    profile ? `${profile.displayName} on ZIVO` : "Profile on ZIVO",
    "Explore a creator profile and video collection on ZIVO.",
  );

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (isAuthLoading) return;
      if (!profileId) {
        if (active) {
          setProfile(null);
          setMedia([]);
          setFollowerCount(0);
          setFollowingCount(0);
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      setError("");
      try {
        const [rawProfile, creatorPosts, allFollows, ownFollows, monetization, personalProfiles] = await Promise.all([
          window.genmb.kv.get(profileKey(profileId)),
          loadCreatorPosts(profileId),
          window.genmb.kv.list("zivo:follow:"),
          window.genmb.kv.list(followPrefix(profileId)),
          isOwnProfile ? loadCreatorMonetizationSettings(profileId) : Promise.resolve(null),
          isOwnProfile ? window.genmb.db.profiles.list({ limit: 1 }) : Promise.resolve(null),
        ]);
        const stored = readStoredProfile(rawProfile);
        const personal = personalProfiles?.data.find((record) => record.userId === profileId);
        let resolved =
          personal && user
            ? {
                ...(stored ?? fallbackProfile(user)),
                displayName: personal.displayName,
                bio: personal.bio ?? "",
                avatarUrl: personal.avatarUrl ?? stored?.avatarUrl ?? undefined,
              }
            : (stored ?? (isOwnProfile && user ? fallbackProfile(user) : null));
        if (!stored && resolved && isOwnProfile) {
          await window.genmb.kv.set(profileKey(profileId), resolved);
        }
        const followers = new Set(
          allFollows.data
            .map((entry) => readFollowRelationship(entry.value))
            .filter((relationship) => relationship?.targetId === profileId)
            .map((relationship) => relationship!.followerId),
        );
        const following = new Set(
          ownFollows.data
            .map((entry) => readFollowRelationship(entry.value))
            .filter((relationship) => relationship?.followerId === profileId)
            .map((relationship) => relationship!.targetId),
        );
        if (!active) return;
        setProfile(resolved);
        setDraft(
          resolved
            ? {
                username: resolved.username.replace(/^@/, ""),
                displayName: resolved.displayName,
                channelName: resolved.channelName ?? "",
                bio: resolved.bio,
                avatarUrl: resolved.avatarUrl ?? "",
                channelAvatarUrl: resolved.channelAvatarUrl ?? "",
              }
            : { username: "", displayName: "", channelName: "", bio: "", avatarUrl: "", channelAvatarUrl: "" },
        );
        const postsById = new Map(
          creatorPosts
            .filter((post) => post.creatorId === profileId)
            .filter((post) => isOwnProfile || post.visibility === "Public")
            .map((post) => [post.id, post]),
        );
        setMedia(
          [...postsById.values()]
            .sort(
              (first, second) =>
                Number(Boolean(second.featured)) - Number(Boolean(first.featured)) ||
                second.createdAt - first.createdAt,
            )
            .map(profileMediaFromPost),
        );
        setFollowerCount(followers.size);
        setFollowingCount(following.size);
        setMonetizationStatus(monetization?.status ?? null);
        if (!resolved) setError("This ZIVO profile is unavailable or has not been set up yet.");
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load this profile.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadProfile();
    return () => {
      active = false;
    };
  }, [isAuthLoading, isOwnProfile, profileId, user]);

  useEffect(() => {
    const onLocalPostPublished = (event: Event) => {
      const post = (event as CustomEvent<StoredPost>).detail;
      if (!post || post.creatorId !== profileId || (!isOwnProfile && post.visibility !== "Public")) return;
      const nextMedia = profileMediaFromPost(post);
      setMedia((current) => [nextMedia, ...current.filter((item) => item.id !== post.id)]);
    };
    const onDeleted = (event: Event) =>
      setMedia((current) => current.filter((item) => item.id !== (event as CustomEvent<string>).detail));
    window.addEventListener(localPostPublishedEvent, onLocalPostPublished);
    window.addEventListener(localPostDeletedEvent, onDeleted);
    return () => {
      window.removeEventListener(localPostPublishedEvent, onLocalPostPublished);
      window.removeEventListener(localPostDeletedEvent, onDeleted);
    };
  }, [isOwnProfile, profileId]);

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    deleteTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (!deleteTarget) return;
    const dialog = deleteDialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        event.preventDefault();
        setDeleteTarget(null);
        deleteTriggerRef.current?.focus();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault();
      controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, isDeleting]);

  const confirmDelete = async () => {
    if (!user || !isOwnProfile || !deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setError("");
    setStatus("");
    try {
      await deleteCreatorPost({ creatorId: user.id, postId: deleteTarget.id });
      setMedia((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setStatus("Post deleted from your creator archive.");
      deleteTriggerRef.current?.focus();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete this video.");
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteDialog = (item: ProfileMedia, trigger: HTMLButtonElement) => {
    deleteTriggerRef.current = trigger;
    setDeleteTarget(item);
    setError("");
    setStatus("");
  };

  const openVideoEditor = async (item: ProfileMedia) => {
    if (!user || !isOwnProfile || editLoadingId) return;
    setEditLoadingId(item.id);
    setError("");
    try {
      const post = await loadPost(item.id);
      if (!post || post.creatorId !== user.id)
        throw new Error("This video is unavailable or does not belong to your account.");
      setEditPost(post);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to open video editor.");
    } finally {
      setEditLoadingId(null);
    }
  };

  const onVideoSaved = (post: StoredPost) => {
    setMedia((current) => current.map((item) => (item.id === post.id ? profileMediaFromPost(post) : item)));
    setStatus("Video details saved to your ZIVO account.");
  };

  const toggleFeatured = async (item: ProfileMedia) => {
    if (!user || !isOwnProfile || featuringId) return;
    setFeaturingId(item.id);
    setError("");
    setStatus("");
    try {
      const updated = await setCreatorPostFeatured({ creatorId: user.id, postId: item.id, featured: !item.featured });
      setMedia((current) =>
        current.map((entry) => ({ ...entry, featured: entry.id === item.id ? updated.featured : false })),
      );
      setStatus(updated.featured ? "Video featured on your profile." : "Video removed from featured.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update featured video.");
    } finally {
      setFeaturingId(null);
    }
  };

  const changeVisibility = async (item: ProfileMedia, visibility: "Public" | "Unlisted" | "Private") => {
    if (!user || !isOwnProfile || visibilityId || item.visibility === visibility) return;
    setVisibilityId(item.id);
    setError("");
    setStatus("");
    try {
      const updated = await setCreatorPostVisibility({ creatorId: user.id, postId: item.id, visibility });
      setMedia((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                visibility: updated.visibility,
                isPublic: updated.visibility === "Public",
                featured: updated.featured,
              }
            : entry,
        ),
      );
      setStatus(`“${item.title}” is now ${visibility.toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update video visibility.");
    } finally {
      setVisibilityId(null);
    }
  };

  const closeLongVideo = () => {
    setSelectedLongVideo(null);
    videoTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (!selectedLongVideo) return;
    const dialog = videoDialogRef.current;
    const focusableSelector = "button:not([disabled]), input:not([disabled])";
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLongVideo();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!controls.length) return;
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? controls.length - 1
          : currentIndex - 1
        : currentIndex === controls.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      controls[nextIndex].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedLongVideo]);

  useEffect(() => {
    if (!logoutOpen) return;
    cancelLogoutRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSigningOut) closeLogout();
      if (event.key !== "Tab") return;
      const controls = [cancelLogoutRef.current, confirmLogoutRef.current].filter((item): item is HTMLButtonElement =>
        Boolean(item),
      );
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
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
  }, [isSigningOut, logoutOpen]);

  const closeLogout = () => {
    if (isSigningOut) return;
    setLogoutOpen(false);
    logoutTriggerRef.current?.focus();
  };

  const closeCrop = () => {
    setCropFile(null);
    avatarInputRef.current?.focus();
  };

  const selectAvatar = (file?: File) => {
    if (!file) return;
    const validation = window.genmb.storage.validate(file, { accept: "image/*" });
    if (!validation.ok) {
      setError(validation.message || "Choose a supported image.");
      return;
    }
    setError("");
    setCropFile(file);
  };

  useEffect(() => {
    const uploader = channelUploaderRef.current;
    if (!isEditing || !uploader) return;
    const onProgress = () => setChannelLogoUploading(true);
    const onComplete = (event: Event) => {
      const files = (event as CustomEvent<{ files: Array<{ url: string }> }>).detail?.files;
      if (files?.[0]?.url) {
        setDraft((current) => ({ ...current, channelAvatarUrl: files[0].url }));
        setStatus("Channel logo uploaded. Save your profile to apply it.");
      }
      setChannelLogoUploading(false);
    };
    const onError = (event: Event) => {
      setChannelLogoUploading(false);
      setError((event as CustomEvent<{ message?: string }>).detail?.message || "Channel logo upload failed.");
    };
    uploader.addEventListener("genmb-upload-progress", onProgress);
    uploader.addEventListener("genmb-upload-complete", onComplete);
    uploader.addEventListener("genmb-upload-error", onError);
    return () => {
      uploader.removeEventListener("genmb-upload-progress", onProgress);
      uploader.removeEventListener("genmb-upload-complete", onComplete);
      uploader.removeEventListener("genmb-upload-error", onError);
    };
  }, [isEditing]);

  const saveProfile = async () => {
    if (!user || !profile || isSaving || isUploadingAvatar || channelLogoUploading) return;
    const username = normalizeUsername(draft.username);
    let displayName: string;
    let channelName: string;
    let bio: string;
    try {
      displayName = validateText(draft.displayName, "Full name", 60, true);
      channelName = validateText(draft.channelName, "Channel name", 60);
      bio = validateText(draft.bio, "Bio", 160);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid profile text.");
      return;
    }
    if (!isValidUsername(username)) {
      setError("Use 3–30 lowercase letters, numbers, periods, hyphens, or underscores for your username.");
      return;
    }
    if (displayName.length < 2 || displayName.length > 60) {
      setError("Use a display name between 2 and 60 characters.");
      return;
    }
    if (bio.length > 160) {
      setError("Keep your bio to 160 characters or fewer.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (await isUsernameTaken(username, user.id)) {
        setError("That username is already in use. Please choose another one.");
        return;
      }
      const nextProfile: StoredProfile = {
        username: `@${username}`,
        displayName,
        channelName: channelName || undefined,
        channelAvatarUrl: draft.channelAvatarUrl || undefined,
        email: user.email,
        bio,
        avatarUrl: draft.avatarUrl || user.picture || undefined,
      };
      const records = await window.genmb.db.profiles.list({ limit: 1 });
      const existing = records.data.find((record) => record.userId === user.id);
      if (existing) {
        await window.genmb.db.profiles.update(existing.id, {
          displayName,
          bio,
          avatarUrl: nextProfile.avatarUrl ?? null,
        });
      } else {
        await window.genmb.db.profiles.create({ displayName, bio, avatarUrl: nextProfile.avatarUrl ?? null });
      }
      await window.genmb.kv.set(profileKey(user.id), nextProfile);
      window.dispatchEvent(new CustomEvent(profileUpdatedEvent, { detail: user.id }));
      setProfile(nextProfile);
      setDraft({
        username,
        displayName,
        channelName,
        bio,
        avatarUrl: nextProfile.avatarUrl ?? "",
        channelAvatarUrl: nextProfile.channelAvatarUrl ?? "",
      });
      setIsEditing(false);
      setStatus("Profile saved to your ZIVO account.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setError("");
    try {
      await window.genmb.auth.signOut();
      navigate("/sign-in", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out. Please try again.");
      setLogoutOpen(false);
    } finally {
      setIsSigningOut(false);
    }
  };

  const visibleMedia = useMemo(() => {
    if (activeTab === "saved")
      return savedItems.map((item) => ({
        id: `${item.contentType}:${item.id}`,
        format: item.contentType === "short" ? "short" : "photo",
        title: item.title,
        image: item.image,
        imageAlt: item.imageAlt,
        views: item.views || "Saved",
        duration: item.duration || "Video",
        type: "videos" as const,
        isVideo: false,
        isLongVideo: false,
        isPublic: false,
        visibility: "Private" as const,
      }));
    return media
      .filter((item) => item.type === activeTab)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.createdAt - a.createdAt);
  }, [activeTab, media, savedItems]);

  if (isAuthLoading || isLoading) {
    return <ZivoLoadingState label="Loading ZIVO profile…" />;
  }

  if (!profile && !user) {
    return (
      <ZivoEmptyState
        title="Your profile is waiting"
        description="Sign in to view and personalize your persistent ZIVO profile."
        action={{ label: "Sign in", onClick: () => navigate("/sign-in") }}
      />
    );
  }

  if (!profile) {
    return (
      <ZivoErrorState title="Profile unavailable" description={error || "We could not find this creator profile."} />
    );
  }

  const avatar = profile.avatarUrl || (isOwnProfile && user?.picture) || avatarFallback(profileId);
  const videoCount = media.filter((item) => item.type === "videos").length;
  const shortCount = media.filter((item) => item.type === "shorts").length;

  return (
    <section className="zivo-screen -mx-5 -mt-6 pb-2" aria-labelledby="page-title">
      <div className="relative overflow-hidden border-b border-border/70 bg-card/35 px-5 pb-6 pt-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-primary/35 via-accent/80 to-background"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-md">
          {(error || followError || savedError) && (
            <ZivoErrorState
              className="mb-3 text-left"
              title="Something needs attention"
              description={error || followError || savedError}
            />
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="relative">
              <span
                className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary via-accent to-primary opacity-90 blur-[2px]"
                aria-hidden="true"
              />
              <img
                data-genmb-img={`${profile.displayName} profile avatar`}
                src={avatar}
                alt={`${profile.displayName} profile`}
                className="relative size-[92px] rounded-full border-[3px] border-background object-cover object-center shadow-premium"
                onError={(event) => {
                  event.currentTarget.src = avatarFallback(profileId);
                }}
              />
              <span className="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                <Check size={13} strokeWidth={3} aria-hidden="true" />
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary/35 bg-background/55 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary backdrop-blur-md">
                <Play size={12} fill="currentColor" aria-hidden="true" /> Creator
              </span>
              {!isOwnProfile && (
                <SafetyMenu
                  targetType="profile"
                  targetId={profileId}
                  targetOwnerId={profileId}
                  targetName={profile.displayName}
                  onSafetyChange={() => navigate("/")}
                />
              )}
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-1.5">
              <h1 id="page-title" className="text-2xl font-extrabold tracking-[-0.065em] text-foreground">
                {profile.displayName}
              </h1>
              <BadgeCheck size={18} className="text-primary" aria-label="Creator profile" />
            </div>
            {profile.channelName && <p className="mt-1 text-sm font-bold text-primary">{profile.channelName}</p>}
            <p className="mt-1 text-sm font-bold text-muted-foreground">{profile.username}</p>
            <p className="mt-3 max-w-sm text-sm font-medium leading-6 text-card-foreground">
              {profile.bio || "No bio yet."}
            </p>
          </div>
          <dl className="zivo-glass-panel mt-6 grid grid-cols-4 overflow-hidden rounded-3xl p-1.5">
            {[
              [String(followerCount), "Followers"],
              [String(followingCount), "Following"],
              [String(videoCount + shortCount), "Posts"],
              [String(shortCount), "Shorts"],
            ].map(([value, label], index) => (
              <div
                key={label}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-4 text-center",
                  index > 0 && "border-l border-border/40",
                )}
              >
                <dd className="text-lg font-extrabold tracking-tight text-card-foreground">{value}</dd>
                <dt className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {label}
                </dt>
              </div>
            ))}
          </dl>
          {isOwnProfile && (
            <div className="mt-6 space-y-2.5">
              <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
                Creator tools
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft({
                      username: profile.username.replace(/^@/, ""),
                      displayName: profile.displayName,
                      channelName: profile.channelName ?? "",
                      bio: profile.bio,
                      avatarUrl: profile.avatarUrl ?? "",
                      channelAvatarUrl: profile.channelAvatarUrl ?? "",
                    });
                    setIsEditing(true);
                    setStatus("");
                  }}
                  className="col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil size={16} aria-hidden="true" /> Edit profile
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/creator/monetization")}
                  className="zivo-glass-panel flex min-h-12 items-center justify-center gap-2 rounded-2xl px-2 text-xs font-extrabold text-card-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Clapperboard size={16} className="shrink-0 text-primary" aria-hidden="true" /> Monetization
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/creator/studio")}
                  className="zivo-glass-panel flex min-h-12 items-center justify-center gap-2 rounded-2xl px-2 text-xs font-extrabold text-card-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Clapperboard size={16} className="text-primary" aria-hidden="true" /> Creator Studio
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/creator/analytics")}
                  className="zivo-glass-panel col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-extrabold text-card-foreground transition-all duration-200 hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BarChart3 size={16} className="text-primary" aria-hidden="true" /> Analytics
                </button>
              </div>
            </div>
          )}
          {isOwnProfile && monetizationStatus && (
            <button
              type="button"
              onClick={() => navigate("/creator/monetization")}
              className="zivo-glass-panel group mt-6 flex min-h-16 w-full items-center gap-3 rounded-3xl px-4 py-3 text-left transition-all duration-200 hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open creator monetization settings"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-accent/70 text-primary">
                <Clapperboard size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-extrabold text-card-foreground">Creator monetization</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">View policy, eligibility & earnings</span>
              </span>
              <span className="shrink-0 rounded-full border border-primary/30 bg-accent/70 px-2.5 py-1 text-xs font-extrabold text-primary">
                {monetizationStatus === "not-eligible"
                  ? "Not eligible"
                  : monetizationStatus === "eligible"
                    ? "Eligible"
                    : monetizationStatus === "enabled"
                      ? "Enabled"
                      : "Disabled"}
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )}
          {isOwnProfile && user && (
            <div className="zivo-glass-panel mt-3 flex min-h-16 items-center justify-between gap-3 rounded-3xl px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-extrabold text-card-foreground">
                  <LogOut size={16} className="text-primary" aria-hidden="true" /> Account
                </p>
                <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">{user.email}</p>
              </div>
              <button
                ref={logoutTriggerRef}
                type="button"
                onClick={() => setLogoutOpen(true)}
                disabled={isSigningOut}
                className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-accent/60 px-3 text-xs font-extrabold text-card-foreground transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <LogOut size={15} aria-hidden="true" />
                Log out
              </button>
            </div>
          )}
          {isEditing && (
            <form
              className="mt-4 space-y-3 rounded-2xl border border-primary/35 bg-card p-4 shadow-premium"
              onSubmit={(event) => {
                event.preventDefault();
                void saveProfile();
              }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-card-foreground">Refine your profile</p>
                <UserRound size={17} className="text-primary" aria-hidden="true" />
              </div>
              <div>
                <label htmlFor="profile-username" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                  Username
                </label>
                <input
                  id="profile-username"
                  value={draft.username}
                  onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
                  disabled={isSaving}
                  maxLength={30}
                  className="min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="profile-display-name" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                  Full name
                </label>
                <input
                  id="profile-display-name"
                  value={draft.displayName}
                  onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                  disabled={isSaving}
                  maxLength={60}
                  className="min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="profile-channel-name" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                  Channel Name
                </label>
                <input
                  id="profile-channel-name"
                  value={draft.channelName}
                  onChange={(event) => setDraft((current) => ({ ...current, channelName: event.target.value }))}
                  disabled={isSaving || isUploadingAvatar || channelLogoUploading}
                  maxLength={60}
                  placeholder="Your creator or brand name"
                  className="min-h-11 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground">
                  Channel logo (separate from your personal photo)
                </p>
                {draft.channelAvatarUrl && (
                  <img
                    data-genmb-img="Channel logo preview"
                    src={draft.channelAvatarUrl}
                    alt="Channel logo preview"
                    className="size-16 rounded-full object-cover object-center"
                    onError={(event) => {
                      event.currentTarget.style.opacity = "0";
                    }}
                  />
                )}
                <genmb-uploader
                  ref={channelUploaderRef}
                  accept="image/*"
                  folder="zivo-channel-logos"
                  theme="dark"
                  label="Upload channel logo"
                />
                {channelLogoUploading && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Uploading channel logo…
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="profile-bio" className="mb-1.5 block text-xs font-bold text-muted-foreground">
                  Bio
                </label>
                <textarea
                  id="profile-bio"
                  value={draft.bio}
                  onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
                  disabled={isSaving}
                  maxLength={160}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-medium leading-5 text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground">Profile picture or channel logo</p>
                <div className="flex items-center gap-3">
                  <genmb-image
                    src={draft.avatarUrl || avatarFallback(profileId)}
                    width="128"
                    alt="Profile picture preview"
                    className="profile-avatar-preview block size-16 shrink-0 overflow-hidden rounded-full border border-border object-cover object-center"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="profile-avatar-file" className="mb-2 block text-xs font-bold text-muted-foreground">
                      Choose a profile picture
                    </label>
                    <input
                      ref={avatarInputRef}
                      id="profile-avatar-file"
                      type="file"
                      accept="image/*"
                      disabled={isSaving || isUploadingAvatar || channelLogoUploading}
                      onChange={(event) => {
                        selectAvatar(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                      className="block w-full text-xs text-card-foreground file:mr-2 file:rounded-xl file:border-0 file:bg-primary file:px-3 file:py-2 file:font-bold file:text-primary-foreground disabled:opacity-60"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Choose a photo, drag and zoom to frame it, then save your profile.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setStatus("Profile changes discarded.");
                  }}
                  disabled={isSaving || isUploadingAvatar || channelLogoUploading}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <X size={17} aria-hidden="true" />
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingAvatar || channelLogoUploading}
                  className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <Check size={17} aria-hidden="true" />
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-md px-5 pt-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator archive</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-[-0.055em] text-foreground">The latest cut</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Eye size={14} className="text-primary" aria-hidden="true" />
            {media.length} uploads
          </span>
        </div>
        <div
          className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-card p-1.5"
          role="tablist"
          aria-label="Profile content"
        >
          {profileTabs
            .filter((tab) => isOwnProfile || tab.id !== "saved")
            .map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-primary text-primary-foreground shadow-premium"
                      : "text-muted-foreground hover:bg-muted hover:text-card-foreground",
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
        </div>
        <div className="mt-4" role="tabpanel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-extrabold text-foreground">
              {profileTabs.find((tab) => tab.id === activeTab)?.label}
            </p>
            <p className="text-xs font-semibold text-muted-foreground">
              {visibleMedia.length} {visibleMedia.length === 1 ? "post" : "posts"}
            </p>
          </div>
          {activeTab === "saved" && savedLoading ? (
            <div className="flex min-h-40 items-center justify-center rounded-2xl border border-border bg-card">
              <ZivoInlineLoader label="Loading saved items…" />
            </div>
          ) : visibleMedia.length === 0 ? (
            <ZivoEmptyState
              title={activeTab === "saved" ? "Nothing saved yet" : "No posts yet"}
              description={
                activeTab === "saved"
                  ? "Bookmark posts or shorts from their save icon to build your collection."
                  : "Published photos, videos and Shorts will appear here."
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visibleMedia.map((item) =>
                item.isLongVideo ? (
                  <article
                    key={item.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card p-2 shadow-premium"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        videoTriggerRef.current = event.currentTarget;
                        setSelectedLongVideo(item);
                      }}
                      className="group relative block w-full overflow-hidden rounded-xl bg-background text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Play ${item.title}`}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={`${item.title} thumbnail`}
                          className="aspect-video w-full object-cover"
                        />
                      ) : (
                        <video
                          src={item.image}
                          preload="metadata"
                          playsInline
                          className="aspect-video w-full bg-background object-contain"
                          aria-label={`${item.imageAlt} preview`}
                        />
                      )}
                      <span
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent"
                        aria-hidden="true"
                      />
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <span className="flex size-12 items-center justify-center rounded-full bg-card/90 text-primary shadow-premium backdrop-blur-sm">
                          <Play size={22} fill="currentColor" />
                        </span>
                      </span>
                      <span
                        className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-background/75 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-foreground backdrop-blur-sm"
                        aria-hidden="true"
                      >
                        {item.duration}
                      </span>
                    </button>
                    <div className="flex flex-wrap items-start gap-2 px-1 pb-2 pt-3">
                      <div className="min-w-0 w-full">
                        <p className="truncate text-sm font-extrabold text-card-foreground">
                          {item.featured ? "📌 Featured · " : ""}
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                          {formatPublishedDate(item.createdAt)} · {item.views}
                        </p>
                      </div>
                      {isOwnProfile && activeTab !== "saved" && (
                        <button
                          type="button"
                          disabled={Boolean(featuringId) || (!item.isPublic && !item.featured)}
                          onClick={() => void toggleFeatured(item)}
                          aria-label={
                            item.featured ? `Remove ${item.title} from featured` : `Set ${item.title} as featured`
                          }
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Pin size={17} fill={item.featured ? "currentColor" : "none"} aria-hidden="true" />
                        </button>
                      )}
                      {isOwnProfile && activeTab !== "saved" && (
                        <button
                          type="button"
                          disabled={Boolean(editLoadingId)}
                          onClick={() => void openVideoEditor(item)}
                          aria-label={`Edit ${item.title}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <Pencil size={17} aria-hidden="true" />
                        </button>
                      )}
                      {isOwnProfile && activeTab !== "saved" && (
                        <label className="shrink-0 text-xs font-bold text-muted-foreground">
                          <span className="sr-only">Visibility for {item.title}</span>
                          <select
                            aria-label={`Visibility for ${item.title}`}
                            value={item.visibility}
                            disabled={Boolean(visibilityId) || Boolean(featuringId) || isDeleting}
                            onChange={(event) =>
                              void changeVisibility(item, event.target.value as "Public" | "Unlisted" | "Private")
                            }
                            className="min-h-10 max-w-24 rounded-xl border border-border bg-muted px-1 text-xs font-bold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            <option value="Public">Public</option>
                            <option value="Unlisted">Unlisted</option>
                            <option value="Private">Private</option>
                          </select>
                        </label>
                      )}
                      {isOwnProfile && activeTab !== "saved" && (
                        <button
                          type="button"
                          onClick={(event) => openDeleteDialog(item, event.currentTarget)}
                          aria-label={`Delete ${item.title}`}
                          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </article>
                ) : item.type === "shorts" && activeTab === "shorts" ? (
                  <article
                    key={item.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-premium"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/shorts/${encodeURIComponent(item.id)}`)}
                      className="relative block aspect-[9/16] w-full overflow-hidden bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Watch ${item.title}`}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={`${item.title} thumbnail`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : item.isVideo ? (
                        <video
                          src={item.image}
                          preload="metadata"
                          muted
                          playsInline
                          aria-label={`${item.imageAlt} preview`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          data-genmb-img={item.imageAlt}
                          src={item.image}
                          alt={item.imageAlt}
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.src = `https://picsum.photos/seed/zivo-short-${item.id}/360/640`;
                          }}
                        />
                      )}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/70 to-transparent p-2 text-xs font-extrabold text-foreground">
                        <Play size={18} fill="currentColor" aria-hidden="true" />
                      </span>
                    </button>
                    <div className="p-2">
                      <p className="truncate text-xs font-extrabold text-card-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatPublishedDate(item.createdAt)} · {item.views}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.duration} · {item.visibility}</p>
                      {isOwnProfile && (
                        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border pt-2">
                          <button
                            type="button"
                            disabled={Boolean(featuringId) || (!item.isPublic && !item.featured)}
                            onClick={() => void toggleFeatured(item)}
                            aria-label={
                              item.featured ? `Remove ${item.title} from featured` : `Set ${item.title} as featured`
                            }
                            className="flex size-9 items-center justify-center rounded-lg bg-muted text-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            <Pin size={16} fill={item.featured ? "currentColor" : "none"} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(editLoadingId)}
                            onClick={() => void openVideoEditor(item)}
                            aria-label={`Edit ${item.title}`}
                            className="flex size-9 items-center justify-center rounded-lg bg-muted text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => openDeleteDialog(item, event.currentTarget)}
                            aria-label={`Delete ${item.title}`}
                            className="flex size-9 items-center justify-center rounded-lg bg-muted text-card-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                          <select
                            aria-label={`Visibility for ${item.title}`}
                            value={item.visibility}
                            disabled={Boolean(visibilityId) || Boolean(featuringId) || isDeleting}
                            onChange={(event) =>
                              void changeVisibility(item, event.target.value as "Public" | "Unlisted" | "Private")
                            }
                            className="min-h-9 min-w-0 max-w-full rounded-lg border border-border bg-muted px-1 text-xs font-bold text-card-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            <option value="Public">Public</option>
                            <option value="Unlisted">Unlisted</option>
                            <option value="Private">Private</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </article>
                ) : (
                  <article
                    key={item.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/50 bg-muted shadow-premium"
                  >
                    {item.isVideo ? (
                      item.thumbnail ? (
                        <img src={item.thumbnail} alt={`${item.title} thumbnail`} className="size-full object-cover" />
                      ) : (
                        <video
                          src={item.image}
                          controls
                          preload="metadata"
                          className="size-full object-cover"
                          aria-label={item.imageAlt}
                        />
                      )
                    ) : (
                      <img
                        data-genmb-img={item.imageAlt}
                        src={item.image}
                        alt={item.imageAlt}
                        className="size-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = `https://picsum.photos/seed/zivo-profile-${item.id}-fallback/640/860`;
                        }}
                      />
                    )}
                    <span
                      className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/5 to-transparent"
                      aria-hidden="true"
                    />
                    <span className="absolute left-2 top-2 flex size-7 items-center justify-center rounded-lg bg-background/65 text-foreground">
                      <Play size={14} fill="currentColor" aria-hidden="true" />
                    </span>
                    {isOwnProfile && activeTab !== "saved" && (
                      <button
                        type="button"
                        disabled={Boolean(featuringId) || (!item.isPublic && !item.featured)}
                        onClick={() => void toggleFeatured(item)}
                        aria-label={
                          item.featured ? `Remove ${item.title} from featured` : `Set ${item.title} as featured`
                        }
                        className="absolute left-2 top-10 flex size-9 items-center justify-center rounded-lg bg-card/90 text-primary shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <Pin size={16} fill={item.featured ? "currentColor" : "none"} aria-hidden="true" />
                      </button>
                    )}
                    {isOwnProfile && activeTab !== "saved" && (
                      <button
                        type="button"
                        disabled={Boolean(editLoadingId)}
                        onClick={() => void openVideoEditor(item)}
                        aria-label={`Edit ${item.title}`}
                        className="absolute right-12 top-2 z-10 flex size-9 items-center justify-center rounded-lg bg-card/90 text-card-foreground shadow-premium focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    )}
                    {isOwnProfile && activeTab !== "saved" && (
                      <select
                        aria-label={`Visibility for ${item.title}`}
                        value={item.visibility}
                        disabled={Boolean(visibilityId) || Boolean(featuringId) || isDeleting}
                        onChange={(event) =>
                          void changeVisibility(item, event.target.value as "Public" | "Unlisted" | "Private")
                        }
                        className="absolute right-2 top-12 z-10 min-h-9 max-w-24 rounded-lg border border-border bg-card px-1 text-xs font-bold text-card-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <option value="Public">Public</option>
                        <option value="Unlisted">Unlisted</option>
                        <option value="Private">Private</option>
                      </select>
                    )}
                    {isOwnProfile && activeTab !== "saved" && (
                      <button
                        type="button"
                        onClick={(event) => openDeleteDialog(item, event.currentTarget)}
                        aria-label={`Delete ${item.title}`}
                        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg bg-card/90 text-card-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                    {item.featured && (
                      <span className="pointer-events-none absolute left-2 top-20 rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                        Featured
                      </span>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
                      <p className="truncate text-xs font-extrabold text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-foreground/75">
                        {item.views} · {item.duration}
                      </p>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 pb-1 text-xs font-semibold text-muted-foreground">
          <Heart size={14} className="text-primary" aria-hidden="true" />
          Persistent ZIVO creator profile
        </div>
      </div>
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onClose={closeCrop}
          onUploading={setIsUploadingAvatar}
          onError={setError}
          onComplete={(url) => {
            setDraft((current) => ({ ...current, avatarUrl: url }));
            setStatus("Cropped photo uploaded. Save your profile to use it as your avatar.");
            closeCrop();
          }}
        />
      )}
      {editPost && user && (
        <EditVideoDetailsDialog
          key={editPost.id}
          post={editPost}
          creatorId={user.id}
          onClose={() => setEditPost(null)}
          onSaved={onVideoSaved}
        />
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-video-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-float"
          >
            <h2 id="delete-video-title" className="text-xl font-extrabold text-card-foreground">
              Delete post?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Delete “{deleteTarget.title}” from your creator archive? This cannot be undone.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-primary">
                {error}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                disabled={isDeleting}
                className="min-h-11 rounded-xl border border-border text-sm font-bold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={16} aria-hidden="true" />
                )}
                {isDeleting ? "Deleting…" : "Delete post"}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedLongVideo && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-3 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <div
            ref={videoDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="long-video-dialog-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-3 shadow-float"
          >
            <div className="mb-3 flex items-start justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator video</p>
                <h2
                  id="long-video-dialog-title"
                  className="mt-1 truncate text-base font-extrabold text-card-foreground"
                >
                  {selectedLongVideo.title}
                </h2>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {selectedLongVideo.creatorName} · {formatPublishedDate(selectedLongVideo.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ContentShareActions
                  contentId={selectedLongVideo.id}
                  format={selectedLongVideo.format}
                  title={selectedLongVideo.title}
                  creatorName={selectedLongVideo.creatorName}
                  isPublic={selectedLongVideo.isPublic}
                />
                <button
                  type="button"
                  onClick={closeLongVideo}
                  className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Close video player"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            <LongFormVideoPlayer src={selectedLongVideo.image} title={selectedLongVideo.title} />
          </div>
        </div>
      )}
      {logoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/75 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-float"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Account</p>
            <h2
              id="logout-dialog-title"
              className="mt-1 text-xl font-extrabold tracking-[-0.055em] text-card-foreground"
            >
              Log out of ZIVO?
            </h2>
            <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground">
              You can sign in again whenever you are ready.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                ref={cancelLogoutRef}
                type="button"
                onClick={closeLogout}
                disabled={isSigningOut}
                className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                ref={confirmLogoutRef}
                type="button"
                onClick={() => void signOut()}
                disabled={isSigningOut}
                className="min-h-11 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isSigningOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </div>
        </div>
      )}
      {status && (
        <p role="status" className="mx-auto mt-3 max-w-md px-5 text-sm text-primary">
          {status}
        </p>
      )}
    </section>
  );
}
