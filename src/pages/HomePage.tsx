import {
  Bookmark,
  Heart,
  Maximize,
  MessageCircle,
  Music2,
  Play,
  Plus,
  Radio,
  Share2,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useFollowedCreators from "../hooks/useFollowedCreators";
import usePageMeta from "../hooks/usePageMeta";
import useVideoEngagement from "../hooks/useVideoEngagement";
import usePersistentLikes from "../hooks/usePersistentLikes";
import useSafetyRelationships from "../hooks/useSafetyRelationships";
import SafetyMenu from "../components/SafetyMenu";
import CreatorPostMenu from "../components/CreatorPostMenu";
import { loadCommentCount } from "../hooks/usePersistentComments";
import CommentThread from "../components/CommentThread";
import ContentShareActions from "../components/ContentShareActions";
import { ZivoInlineLoader } from "../components/ZivoState";
import { useAuth } from "../auth/AuthProvider";
import { actorFromUser, createNotification } from "../lib/notifications";
import { loadLiveSessions, type ZivoLiveSession } from "../lib/live";
import { loadPosts, localPostPublishedEvent, localPostUpdatedEvent, localPostDeletedEvent, type StoredPost } from "../lib/posts";
import { profileUpdatedEvent } from "../lib/profiles";
import { loadActiveStories, type StoredStory } from "../lib/stories";
import { cn } from "../lib/utils";

type FeedTab = "for-you" | "following";

type Story = {
  id: string;
  creator: string;
  avatar: string;
  image: string;
  imageAlt: string;
  caption: string;
  timeLabel: string;
  expiresAt?: number;
};

function timeSince(timestamp: number) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return elapsedHours < 24 ? `${elapsedHours}h` : "1d";
}

function storyFromStored(story: StoredStory): Story {
  return {
    id: story.id,
    creator: story.creatorName,
    avatar: story.creatorAvatar,
    image: story.mediaRef,
    imageAlt: story.mediaAlt,
    caption: story.content,
    timeLabel: timeSince(story.createdAt),
    expiresAt: story.expiresAt,
  };
}
type Music = { id: string; title: string; artist: string; uses: string; artwork: string; artAlt: string };
type Post = {
  id: string;
  creator: string;
  handle: string;
  postType?: 'personal' | 'channel';
  avatar: string;
  image: string;
  imageAlt: string;
  duration: string;
  category: string;
  caption: string;
  title?: string;
  description?: string;
  likes: number;
  comments: number;
  shares: number;
  views: string;
  ownerId: string;
  isVideo?: boolean;
  videoUrl?: string;
  video?: string | { url?: string };
  mediaUrl?: string;
  media?: string | { url?: string };
  fileUrl?: string;
  url?: string;
  isLongVideo?: boolean;
  isPublic: boolean;
};

function videoSourceForPost(post: Post) {
  if (!post.isVideo) return undefined;
  const candidates: unknown[] = [post.videoUrl, post.video, post.mediaUrl, post.media, post.fileUrl, post.url];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate :
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as { url?: unknown }).url : undefined;
    if (typeof value !== "string") continue;
    const source = value.trim();
    if (/^https?:\/\//i.test(source) || /^blob:/i.test(source) || source.startsWith("/api/apps/")) return source;
  }
  return undefined;
}

const demoStories: Story[] = [
  {
    id: "maya-city-lights",
    creator: "Maya Chen",
    avatar: "https://picsum.photos/seed/zivo-story-maya-avatar/96/96",
    image: "https://images.pexels.com/photos/20208915/pexels-photo-20208915.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Bright city lights at night",
    caption: "A few quiet minutes before the city wakes up. ✨",
    timeLabel: "12m",
  },
  {
    id: "theo-workbench",
    creator: "Theo James",
    avatar: "https://picsum.photos/seed/zivo-story-theo-avatar/96/96",
    image: "https://images.pexels.com/photos/27853834/pexels-photo-27853834.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Creative workbench in a studio",
    caption: "Today’s studio table: clay, sketches, and good coffee.",
    timeLabel: "28m",
  },
  {
    id: "amara-sunrise",
    creator: "Amara Wells",
    avatar: "https://picsum.photos/seed/zivo-story-amara-avatar/96/96",
    image: "https://images.pexels.com/photos/30860678/pexels-photo-30860678.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Sunrise over a coastal trail",
    caption: "The kind of morning that makes an early alarm worth it.",
    timeLabel: "43m",
  },
  {
    id: "lena-records",
    creator: "Lena Ortiz",
    avatar: "https://picsum.photos/seed/zivo-story-lena-avatar/96/96",
    image: "https://images.pexels.com/photos/6265185/pexels-photo-6265185.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Record collection and turntable",
    caption: "Sunday soundtrack selection is getting serious.",
    timeLabel: "1h",
  },
];

const music: Music[] = [
  {
    id: "neon-tide",
    title: "Neon Tide",
    artist: "Luna Vale",
    uses: "18.4K videos",
    artwork: "https://picsum.photos/seed/zivo-home-neon-tide/160/160",
    artAlt: "Neon abstract album cover",
  },
  {
    id: "slow-bloom",
    title: "Slow Bloom",
    artist: "Arden Gray",
    uses: "12.8K videos",
    artwork: "https://picsum.photos/seed/zivo-home-slow-bloom/160/160",
    artAlt: "Floral album cover",
  },
  {
    id: "afterglow",
    title: "Afterglow Drive",
    artist: "Milo North",
    uses: "9.6K videos",
    artwork: "https://picsum.photos/seed/zivo-home-afterglow/160/160",
    artAlt: "Sunset album cover",
  },
];

const posts: Post[] = [
  {
    id: "night-market",
    creator: "Maya Chen",
    handle: "@mayamakes",
    avatar: "https://picsum.photos/seed/zivo-maya-avatar/96/96",
    image: "https://images.pexels.com/photos/36131809/pexels-photo-36131809.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Neon-lit night market street",
    duration: "0:42",
    category: "Street culture",
    caption: "Found the best five-minute reset after a long day in the city. ✨",
    likes: 12800,
    comments: 284,
    shares: 91,
    views: "86.2K views",
    ownerId: "creator:maya-chen",
    isPublic: false,
  },
  {
    id: "ceramic-studio",
    creator: "Theo James",
    handle: "@theoforms",
    avatar: "https://picsum.photos/seed/zivo-theo-avatar/96/96",
    image: "https://images.pexels.com/photos/5642023/pexels-photo-5642023.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Hands shaping clay in a studio",
    duration: "1:08",
    category: "Creative process",
    caption: "A little patience, a little pressure, and the shape starts to appear.",
    likes: 8900,
    comments: 156,
    shares: 64,
    views: "54.8K views",
    ownerId: "creator:theo-james",
    isPublic: false,
  },
  {
    id: "coast-run",
    creator: "Amara Wells",
    handle: "@amarawells",
    avatar: "https://picsum.photos/seed/zivo-amara-avatar/96/96",
    image: "https://images.pexels.com/photos/11920628/pexels-photo-11920628.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    imageAlt: "Runner on a coastal trail at sunrise",
    duration: "0:36",
    category: "Daily ritual",
    caption: "Before the notifications start: fresh air, quiet miles, clear head.",
    likes: 21600,
    comments: 419,
    shares: 138,
    views: "132K views",
    ownerId: "creator:amara-wells",
    isPublic: false,
  },
];

function postFromStored(post: StoredPost): Post {
  const record = post as StoredPost & Record<string, unknown>;
  const resolvedMediaUrl = videoSourceForPost({
    id: post.id,
    creator: post.creatorName,
    handle: post.creatorHandle,
    avatar: post.creatorAvatar,
    image: post.mediaUrl || post.mediaRef,
    imageAlt: post.mediaAlt,
    duration: post.duration,
    category: post.category,
    caption: post.caption,
    title: post.title,
    description: post.description,
    likes: post.engagement.likeCount,
    comments: post.engagement.commentCount,
    shares: 0,
    views: "",
    ownerId: post.creatorId,
    isPublic: post.visibility === "Public",
    isVideo: post.mediaType === "video",
    videoUrl: typeof record.videoUrl === "string" ? record.videoUrl : undefined,
    video: record.video as Post["video"],
    mediaUrl: typeof record.mediaUrl === "string" ? record.mediaUrl : undefined,
    media: record.media as Post["media"],
    fileUrl: typeof record.fileUrl === "string" ? record.fileUrl : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
  });

  return {
    id: post.id,
    creator: post.creatorName,
    handle: post.creatorHandle,
    postType: post.post_type,
    avatar: post.creatorAvatar,
    image: resolvedMediaUrl || post.mediaUrl || post.mediaRef,
    imageAlt: post.mediaAlt,
    duration: post.duration,
    category: post.category,
    caption: post.caption,
    title: post.title,
    description: post.description,
    likes: post.engagement.likeCount,
    comments: post.engagement.commentCount,
    shares: 0,
    views: "",
    ownerId: post.creatorId,
    isVideo: post.mediaType === "video",
    videoUrl: post.mediaType === "video" ? resolvedMediaUrl || post.mediaUrl || post.mediaRef : undefined,
    mediaUrl: resolvedMediaUrl || post.mediaUrl || post.mediaRef,
    video: record.video as Post["video"],
    media: record.media as Post["media"],
    fileUrl: typeof record.fileUrl === "string" ? record.fileUrl : undefined,
    url: typeof record.url === "string" ? record.url : undefined,
    isLongVideo: post.format === "video",
    isPublic: post.visibility === "Public",
  };
}

function formatCount(count: number) {
  return count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K` : String(count);
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [persistedCommentCounts, setPersistedCommentCounts] = useState<Record<string, number>>({});
  const [shareMessage, setShareMessage] = useState("");
  const [feedMessage, setFeedMessage] = useState("");
  const [seenStories, setSeenStories] = useState<string[]>(["lena-records"]);
  const [persistedStories, setPersistedStories] = useState<Story[]>([]);
  const [isStoriesLoading, setIsStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState("");
  const [persistedPosts, setPersistedPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [liveSessions, setLiveSessions] = useState<ZivoLiveSession[]>([]);
  const [liveError, setLiveError] = useState("");
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [likedStories, setLikedStories] = useState<string[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  const likeTargets = [...persistedPosts, ...posts].map((post) => ({ id: post.id, contentType: "post" as const }));
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  usePageMeta("ZIVO Home — Premium Social Video", "Explore a curated feed of premium social video on ZIVO.");
  const {
    followedCreatorIds,
    isLoading: isFollowsLoading,
    updatingCreatorId,
    error: followError,
    toggleFollow,
  } = useFollowedCreators();
  const {
    savedIds: savedPosts,
    isLoading: isEngagementLoading,
    isUpdating: isEngagementUpdating,
    error: engagementError,
    toggleSave,
  } = useVideoEngagement();
  const {
    likedIds: likedPosts,
    likeCounts,
    isLoading: isLikesLoading,
    updatingId: updatingLikeId,
    error: likesError,
    toggleLike,
  } = usePersistentLikes(likeTargets);
  const { hiddenUserIds, reload: reloadSafety } = useSafetyRelationships();

  const feedPosts = [...persistedPosts, ...posts].filter(
    (post) => post.isPublic && !hiddenUserIds.includes(post.ownerId),
  );
  const visiblePosts =
    activeTab === "for-you" ? feedPosts : feedPosts.filter((post) => followedCreatorIds.includes(post.ownerId));
  const stories = [
    ...persistedStories.filter((story) => !story.expiresAt || story.expiresAt > Date.now()),
    ...demoStories,
  ];
  const activeStory = activeStoryIndex === null ? null : stories[activeStoryIndex];

  const toggleListItem = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    setter((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  useEffect(() => {
    const navigationState = location.state as { storyPublished?: boolean; postPublished?: boolean } | null;
    if (navigationState?.storyPublished) {
      setFeedMessage("Your story is live for the next 24 hours.");
      navigate("/", { replace: true, state: null });
    }
    if (navigationState?.postPublished) {
      setFeedMessage("Your post is live in the Home feed.");
      navigate("/", { replace: true, state: null });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    let active = true;
    const loadStories = async () => {
      setIsStoriesLoading(true);
      setStoriesError("");
      try {
        const loadedStories = await loadActiveStories();
        if (active) setPersistedStories(loadedStories.map(storyFromStored));
      } catch (error) {
        if (active) setStoriesError(error instanceof Error ? error.message : "Unable to load stories right now.");
      } finally {
        if (active) setIsStoriesLoading(false);
      }
    };
    void loadStories();
    const refreshInterval = window.setInterval(() => void loadStories(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadLives = async () => {
      try {
        const sessions = await loadLiveSessions();
        if (active) {
          setLiveSessions(sessions.filter((session) => session.status === "live"));
          setLiveError("");
        }
      } catch (error) {
        if (active) setLiveError(error instanceof Error ? error.message : "Unable to load Live sessions.");
      }
    };
    void loadLives();
    const interval = window.setInterval(() => void loadLives(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [location.key]);

  useEffect(() => {
    const onPostPublished = (event: Event) => {
      const post = (event as CustomEvent<StoredPost>).detail;
      if (!post || post.visibility !== "Public") return;
      setPersistedPosts((current) => [postFromStored(post), ...current.filter((item) => item.id !== post.id)]);
    };
    const onPostUpdated = (event: Event) => {
      const post = (event as CustomEvent<StoredPost>).detail;
      if (!post) return;
      setPersistedPosts((current) => post.visibility === "Public"
        ? current.some((item) => item.id === post.id)
          ? current.map((item) => item.id === post.id ? postFromStored(post) : item)
          : [postFromStored(post), ...current]
        : current.filter((item) => item.id !== post.id));
    };
    const onPostDeleted = (event: Event) => setPersistedPosts((current) => current.filter((item) => item.id !== (event as CustomEvent<string>).detail));
    window.addEventListener(localPostDeletedEvent, onPostDeleted);
    window.addEventListener(localPostPublishedEvent, onPostPublished);
    window.addEventListener(localPostUpdatedEvent, onPostUpdated);
    return () => {
      window.removeEventListener(localPostDeletedEvent, onPostDeleted);
      window.removeEventListener(localPostPublishedEvent, onPostPublished);
      window.removeEventListener(localPostUpdatedEvent, onPostUpdated);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPersistedPosts = async () => {
      setIsPostsLoading(true);
      setPostsError("");
      try {
        const loadedPosts = await loadPosts();
        if (active) setPersistedPosts(loadedPosts.map(postFromStored));
      } catch (error) {
        if (active) setPostsError(error instanceof Error ? error.message : "Unable to load posts right now.");
      } finally {
        if (active) setIsPostsLoading(false);
      }
    };
    void loadPersistedPosts();
    window.addEventListener(profileUpdatedEvent, loadPersistedPosts);
    return () => {
      active = false;
      window.removeEventListener(profileUpdatedEvent, loadPersistedPosts);
    };
  }, [location.key]);

  useEffect(() => {
    let active = true;
    const loadCommentCounts = async () => {
      try {
        const entries = await Promise.all(
          feedPosts.map(async (post) => [post.id, await loadCommentCount("post", post.id)] as const),
        );
        if (active) setPersistedCommentCounts(Object.fromEntries(entries));
      } catch (error) {
        if (active)
          setFeedMessage(
            error instanceof Error ? `Comments could not load: ${error.message}` : "Comments could not load right now.",
          );
      }
    };

    void loadCommentCounts();
    return () => {
      active = false;
    };
  }, [persistedPosts]);

  useEffect(() => {
    const element = pullRef.current;
    if (!element) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const start = (event: TouchEvent) => {
      tracking = window.scrollY <= 2 && !refreshing && activeStoryIndex === null;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    };
    const move = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (window.scrollY > 2 || Math.abs(dx) > Math.abs(dy) || dy <= 0) return;
      event.preventDefault();
      const distance = Math.min(110, 110 * (1 - Math.exp(-dy / 150)));
      if (Math.abs(distance - pullDistanceRef.current) < 3) return;
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };
    const end = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const shouldRefresh = event.type === 'touchend' && pullDistanceRef.current >= 65;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      if (!shouldRefresh) return;
      setRefreshing(true);
      void Promise.allSettled([loadPosts(), loadActiveStories(), loadLiveSessions()]).then((results) => {
        const [postResult, storyResult, liveResult] = results;
        if (postResult.status === 'fulfilled') { setPersistedPosts(postResult.value.map(postFromStored)); setPostsError(''); }
        else setPostsError(postResult.reason instanceof Error ? postResult.reason.message : 'Unable to refresh posts.');
        if (storyResult.status === 'fulfilled') { setPersistedStories(storyResult.value.map(storyFromStored)); setStoriesError(''); }
        else setStoriesError(storyResult.reason instanceof Error ? storyResult.reason.message : 'Unable to refresh stories.');
        if (liveResult.status === 'fulfilled') { setLiveSessions(liveResult.value.filter((session) => session.status === 'live')); setLiveError(''); }
        else setLiveError(liveResult.reason instanceof Error ? liveResult.reason.message : 'Unable to refresh Live sessions.');
        setFeedMessage(results.every((result) => result.status === 'fulfilled') ? 'Feed refreshed.' : 'Some feed content could not refresh.');
      }).finally(() => setRefreshing(false));
    };
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
    };
  }, [refreshing, activeStoryIndex]);

  const updatePostCommentCount = useCallback((postId: string, count: number) => {
    setPersistedCommentCounts((current) => (current[postId] === count ? current : { ...current, [postId]: count }));
  }, []);
  const selectFeedTab = (tab: FeedTab) => {
    setActiveTab(tab);
    setFeedMessage(`${tab === "for-you" ? "For You" : "Following"} feed selected.`);
  };
  const handleFollow = async (post: Post) => {
    const result = await toggleFollow(post.ownerId);
    if (!result) return;
    if (result.persisted && result.following && user) {
      try {
        await createNotification({
          dedupeId: `follow:${user.id}:${post.ownerId}`,
          kind: "follow",
          recipientId: post.ownerId,
          actor: await actorFromUser(user),
          message: "started following you.",
        });
      } catch (caughtError) {
        setFeedMessage(
          `Following ${post.creator}. Saved to your account, but the notification could not be sent: ${caughtError instanceof Error ? caughtError.message : "unknown error"}`,
        );
        return;
      }
    }
    setFeedMessage(
      result.persisted
        ? `${result.following ? "Following" : "Unfollowed"} ${post.creator}. Saved to your account.`
        : `${result.following ? "Following" : "Unfollowed"} ${post.creator} for this session. Sign in to save it.`,
    );
  };
  const handleLike = async (post: Post) => {
    const result = await toggleLike({ id: post.id, contentType: "post" });
    if (!result) return;
    if (result.requiresAuth) {
      setFeedMessage("Sign in to like posts.");
      navigate("/sign-in");
      return;
    }
    if (result.liked && user) {
      try {
        await createNotification({
          dedupeId: `like:${user.id}:${post.id}`,
          kind: "like",
          recipientId: post.ownerId,
          actor: await actorFromUser(user),
          contentId: post.id,
          contentType: "post",
          contentPreview: post.image,
          message: `liked your video “${post.caption}”`,
        });
      } catch (caughtError) {
        setFeedMessage(
          `Liked ${post.creator}'s post, but the notification could not be sent: ${caughtError instanceof Error ? caughtError.message : "unknown error"}`,
        );
        return;
      }
    }
    setFeedMessage(`${result.liked ? "Liked" : "Unliked"} ${post.creator}'s post. Saved to your account.`);
  };
  const handleSave = async (post: Post) => {
    const result = await toggleSave({
      id: post.id,
      contentType: "post",
      creator: post.creator,
      title: post.title || post.caption,
      image: post.image,
      imageAlt: post.imageAlt,
      duration: post.duration,
      views: post.views,
    });
    if (!result) return;
    if (result.requiresAuth) {
      setFeedMessage("Sign in to save posts.");
      navigate("/sign-in");
      return;
    }
    setFeedMessage(
      `${result.selected ? "Saved" : "Removed"} ${post.creator}'s post ${result.selected ? "to" : "from"} your saved items.`,
    );
  };
  const openStory = (index: number, trigger: HTMLElement) => {
    lastFocusedElement.current = trigger;
    setSeenStories((current) => (current.includes(stories[index].id) ? current : [...current, stories[index].id]));
    setActiveStoryIndex(index);
    setStoryProgress(0);
  };
  const closeStory = () => {
    setActiveStoryIndex(null);
    setStoryProgress(0);
  };
  const goToStory = (index: number) => {
    setSeenStories((current) => (current.includes(stories[index].id) ? current : [...current, stories[index].id]));
    setActiveStoryIndex(index);
    setStoryProgress(0);
  };
  const advanceStory = () => {
    if (activeStoryIndex === null) return;
    activeStoryIndex === stories.length - 1 ? closeStory() : goToStory(activeStoryIndex + 1);
  };
  const previousStory = () => {
    if (activeStoryIndex === null) return;
    if (storyProgress > 12 || activeStoryIndex === 0) setStoryProgress(0);
    else goToStory(activeStoryIndex - 1);
  };

  const openVideoFullscreen = async (video: HTMLVideoElement | null) => {
    if (!video) return;
    try {
      if (video.requestFullscreen) await video.requestFullscreen();
      else {
        const iosVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
        if (!iosVideo.webkitEnterFullscreen) throw new Error("Fullscreen is not available in this browser.");
        iosVideo.webkitEnterFullscreen();
      }
    } catch (error) {
      setFeedMessage(error instanceof Error ? error.message : "Fullscreen is not available in this browser.");
    }
  };

  const sharePost = async (post: Post) => {
    const text = `Watch “${post.caption}” by ${post.creator} on ZIVO.`;
    try {
      if (navigator.share) await navigator.share({ title: "ZIVO", text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
      else {
        setShareMessage("Sharing is not available in this browser.");
        return;
      }
      setShareMessage("Ready to share.");
    } catch (error) {
      setShareMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "Sharing cancelled."
          : "Could not open sharing. Please try again.",
      );
    }
  };

  useEffect(() => {
    if (activeStoryIndex === null) return;
    const timer = window.setInterval(() => setStoryProgress((value) => Math.min(value + 2.5, 100)), 125);
    return () => window.clearInterval(timer);
  }, [activeStoryIndex]);

  useEffect(() => {
    if (activeStoryIndex !== null && storyProgress >= 100) advanceStory();
  }, [storyProgress, activeStoryIndex]);

  useEffect(() => {
    if (activeStoryIndex === null) {
      lastFocusedElement.current?.focus();
      return;
    }
    const closeButton = viewerRef.current?.querySelector<HTMLElement>("[data-story-close]");
    closeButton?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeStory();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        viewerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeStoryIndex]);

  return (
    <section ref={pullRef} className="-mx-5 -mt-5" aria-labelledby="page-title">
      <div className="home-pull-indicator absolute inset-x-0 flex justify-center text-xs font-bold text-primary" style={{ top: -36, opacity: pullDistance > 8 ? 1 : 0 }} aria-hidden="true">
        {pullDistance >= 65 ? 'Release to refresh' : 'Pull to refresh'}
      </div>
      <span className="sr-only" role="status">{refreshing ? 'Refreshing feed…' : ''}</span>
      <h1 id="page-title" className="sr-only">
        ZIVO home feed
      </h1>
      <div className="home-feed-tabs z-30 border-b border-border/60 bg-background px-5 pt-2">
        <div className="mx-auto flex max-w-md items-center justify-between" role="tablist" aria-label="Home feed">
          <div className="flex gap-8">
            {(
              [
                ["for-you", "For You"],
                ["following", "Following"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="feed-panel"
                onClick={() => selectFeedTab(tab)}
                className={cn(
                  "relative min-h-11 pb-2.5 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activeTab === tab ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-all",
                    activeTab === tab ? "bg-primary opacity-100" : "scale-x-0 bg-primary opacity-0",
                  )}
                />
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">
            <Sparkles size={13} aria-hidden="true" /> Fresh now
          </span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {feedMessage}
      </p>

      <div id="feed-panel" role="tabpanel" className={cn('home-pull-content mx-auto max-w-md space-y-6 px-5 pt-5', pullDistance > 0 && 'is-pulling')} style={{ transform: pullDistance ? `translateY(${pullDistance}px)` : undefined }}>
        <section aria-labelledby="stories-title">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.19em] text-primary">Fresh today</p>
              <h2 id="stories-title" className="mt-0.5 text-lg font-extrabold tracking-[-0.045em] text-foreground">
                Around your world
              </h2>
            </div>
            <span className="text-xs font-bold text-muted-foreground">
              {isStoriesLoading ? "Loading moments" : "24h moments"}
            </span>
          </div>
          {storiesError && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-primary/45 bg-accent px-3 py-2 text-xs font-semibold text-card-foreground"
            >
              Your saved stories could not load: {storiesError}
            </p>
          )}
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            <Link
              to="/create"
              aria-label="Add to your story"
              className="group flex w-[68px] shrink-0 flex-col items-center gap-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="zivo-story-ring relative flex size-[62px] items-center justify-center rounded-full p-[3px]">
                <span className="flex size-full items-center justify-center rounded-full border-2 border-background bg-card text-card-foreground">
                  <Plus size={21} aria-hidden="true" />
                </span>
                <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                  <Plus size={12} strokeWidth={3} aria-hidden="true" />
                </span>
              </span>
              <span className="w-full truncate text-center text-xs font-bold text-foreground">Your story</span>
            </Link>
            {isStoriesLoading ? (
              <div className="flex w-[104px] shrink-0 items-center pt-5 text-xs font-semibold text-muted-foreground">
                <ZivoInlineLoader label="Loading stories…" />
              </div>
            ) : null}
            {stories.map((story, index) => {
              const seen = seenStories.includes(story.id);
              return (
                <button
                  key={story.id}
                  type="button"
                  onClick={(event) => openStory(index, event.currentTarget)}
                  aria-label={`View ${story.creator}'s story${seen ? ", seen" : ", new"}`}
                  className="flex w-[68px] shrink-0 flex-col items-center gap-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "zivo-story-ring flex size-[62px] items-center justify-center rounded-full p-[3px]",
                      seen && "zivo-story-ring-seen",
                    )}
                  >
                    <span className="size-full rounded-full border-2 border-background p-0.5">
                      <img
                        data-genmb-img={`${story.creator} story profile`}
                        src={story.avatar}
                        alt={`${story.creator} profile placeholder`}
                        className="size-full rounded-full object-cover"
                        onError={(event) => {
                          event.currentTarget.src = `https://picsum.photos/seed/${story.id}-avatar-fallback/96/96`;
                        }}
                      />
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-xs font-bold text-foreground">
                    {story.creator.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {(liveSessions.length > 0 || liveError) && (
          <section
            aria-labelledby="live-now-title"
            className="rounded-2xl border border-primary/35 bg-card p-4 shadow-premium"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-primary">
                  <Radio size={15} aria-hidden="true" />
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">Happening now</p>
                </div>
                <h2 id="live-now-title" className="mt-1 text-lg font-extrabold text-card-foreground">
                  Live on ZIVO
                </h2>
              </div>
              <Link
                to="/create"
                className="min-h-10 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground"
              >
                Go Live
              </Link>
            </div>
            {liveError ? (
              <p role="alert" className="mt-3 text-xs font-semibold text-muted-foreground">
                Live sessions could not load: {liveError}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {liveSessions.map((live) => (
                  <Link
                    key={live.liveSessionId}
                    to={`/live/${encodeURIComponent(live.liveSessionId)}`}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <img
                      data-genmb-img={`${live.creatorProfile.displayName} live profile`}
                      src={live.creatorProfile.avatarUrl}
                      alt=""
                      className="size-11 rounded-full border border-border object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-card-foreground">{live.title}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">
                        {live.creatorProfile.displayName}
                        {live.category ? ` · ${live.category}` : ""}
                      </span>
                    </span>
                    <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] text-primary-foreground">
                      LIVE
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        <section
          className="zivo-glass-panel overflow-hidden rounded-[2rem] py-4"
          aria-labelledby="music-title"
        >
          <div className="flex items-center justify-between px-5">
            <div>
              <div className="flex items-center gap-1.5 text-primary">
                <TrendingUp size={14} aria-hidden="true" />
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">Soundtrack the moment</p>
              </div>
              <h2 id="music-title" className="mt-1 text-lg font-extrabold tracking-[-0.04em] text-foreground">
                Trending music
              </h2>
            </div>
            <Music2 size={20} className="text-primary" aria-hidden="true" />
          </div>
          <div
            className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
            aria-label="Trending music"
          >
            {music.map((track) => {
              const selected = selectedMusic === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedMusic(track.id);
                    setFeedMessage(`${track.title} selected.`);
                  }}
                  className={cn(
                    "zivo-glass-panel flex w-52 shrink-0 snap-start items-center gap-3 rounded-[1.4rem] p-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-accent/70" : "hover:border-primary/55",
                  )}
                >
                  <span className="relative shrink-0">
                    <img
                      data-genmb-img={track.artAlt}
                      src={track.artwork}
                      alt=""
                      className="size-12 rounded-xl object-cover"
                      onError={(event) => {
                        event.currentTarget.src = `https://picsum.photos/seed/${track.id}-fallback/160/160`;
                      }}
                    />
                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Play size={10} fill="currentColor" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-card-foreground">{track.title}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">
                      {track.artist}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold text-primary">{track.uses}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {(followError || engagementError || likesError || postsError) && (
          <p
            role="alert"
            className="rounded-2xl border border-primary/45 bg-accent px-4 py-3 text-sm font-semibold text-card-foreground"
          >
            {followError || engagementError || likesError || `Your saved posts could not load: ${postsError}`}
          </p>
        )}
        {isPostsLoading && (
          <div className="flex justify-center py-1">
            <ZivoInlineLoader label="Loading your saved posts…" />
          </div>
        )}
        {!isPostsLoading && activeTab === "following" && visiblePosts.length === 0 && (
          <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-premium">
            <p className="text-sm font-extrabold text-card-foreground">Your Following feed is quiet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Follow creators from the For You feed to see their posts here.
            </p>
          </div>
        )}
        {visiblePosts.map((post) => {
          const videoSource = videoSourceForPost(post);
          const liked = likedPosts.includes(post.id);
          const saved = savedPosts.includes(post.id);
          const followed = followedCreatorIds.includes(post.ownerId);
          const commentsOpen = openComments === post.id;
          return (
            <article
              key={post.id}
              className="zivo-feed-card zivo-post-float overflow-hidden rounded-[1.5rem]"
            >
              <div className="flex items-center gap-3 px-5 pb-4 pt-5">
                <img
                  data-genmb-img={`${post.creator} creator profile`}
                  src={post.avatar}
                  alt={`${post.creator} profile picture`}
                  className="size-11 rounded-full border border-border object-cover object-center"
                  onError={(event) => {
                    event.currentTarget.src = `https://picsum.photos/seed/${post.id}-avatar-fallback/96/96`;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-card-foreground">{post.creator}</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                    {post.postType === 'channel' ? post.category : `${post.handle} · ${post.category}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-2">
                  <button
                    type="button"
                    aria-pressed={followed}
                    onClick={() => void handleFollow(post)}
                    disabled={isFollowsLoading || updatingCreatorId === post.ownerId}
                    className={cn(
                      "zivo-post-follow inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                      followed
                        ? "border border-border bg-muted text-card-foreground"
                        : "bg-primary text-primary-foreground shadow-premium",
                    )}
                  >
                    {updatingCreatorId === post.ownerId ? "Saving…" : followed ? "Following" : "Follow"}
                  </button>
                  <CreatorPostMenu postId={post.id} creatorId={post.ownerId} title={post.title || post.caption || 'Post'} />
                  <SafetyMenu targetType={post.isLongVideo ? "video" : post.isVideo ? "short" : "post"} targetId={post.id} targetOwnerId={post.ownerId} targetName={post.creator} onSafetyChange={() => void reloadSafety()} />
                </div>
              </div>
              <div className={cn("relative mx-4 overflow-hidden rounded-2xl bg-muted", videoSource ? "aspect-video" : "aspect-[4/5]")}>
                {videoSource ? (
                  <>
                    <video
                      src={videoSource}
                      controls
                      playsInline
                      preload="metadata"
                      className="size-full bg-background object-contain"
                      aria-label={post.imageAlt}
                    />
                    <button
                      type="button"
                      aria-label={`View ${post.creator}'s video fullscreen`}
                      onClick={(event) => void openVideoFullscreen(event.currentTarget.parentElement?.querySelector("video") ?? null)}
                      className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-background/75 text-foreground backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Maximize size={18} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <img
                    data-genmb-img={post.imageAlt}
                    src={post.image}
                    alt={post.imageAlt}
                    className="block size-full object-contain object-center"
                    onError={(event) => {
                      event.currentTarget.src = `https://picsum.photos/seed/${post.id}-fallback/900/1125`;
                    }}
                  />
                )}
                {!post.isLongVideo && !videoSource && (
                  <>
                    <span
                      className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-background/10"
                      aria-hidden="true"
                    />
                    <span className="absolute left-3 top-3 rounded-full border border-card/35 bg-background/50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.13em] text-foreground backdrop-blur-md">
                      {post.category}
                    </span>
                    <span
                      className="absolute bottom-3 left-3 flex size-11 items-center justify-center rounded-full bg-card/90 text-primary shadow-premium backdrop-blur-sm"
                      aria-label={`Video duration ${post.duration}`}
                    >
                      <Play size={18} fill="currentColor" aria-hidden="true" />
                    </span>
                    <span className="absolute bottom-4 right-3 rounded-lg bg-background/55 px-2 py-1 text-xs font-bold text-foreground backdrop-blur-md">
                      {post.duration}
                    </span>
                  </>
                )}
              </div>
              <div className="px-5 pb-5 pt-3">
                <div className="flex items-start justify-between gap-1 border-b border-border/40 pb-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                    <button
                      type="button"
                      onClick={() => void handleLike(post)}
                      disabled={isLikesLoading || updatingLikeId === post.id}
                      aria-label={liked ? `Unlike ${post.creator}'s post` : `Like ${post.creator}'s post`}
                      aria-pressed={liked}
                      className={cn(
                        "zivo-post-action flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                        liked ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Heart size={20} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
                      {formatCount(post.likes + (likeCounts[post.id] ?? 0))}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenComments(commentsOpen ? null : post.id)}
                      aria-label={`Show comments on ${post.creator}'s post`}
                      aria-expanded={commentsOpen}
                      className="zivo-post-action flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MessageCircle size={20} aria-hidden="true" />
                      {formatCount(persistedCommentCounts[post.id] ?? 0)}
                    </button>
                    <ContentShareActions
                      className="zivo-post-share gap-1"
                      contentId={post.id}
                      format={post.isLongVideo ? "video" : post.isVideo ? "short" : "photo"}
                      title={post.title || post.caption}
                      creatorName={post.creator}
                      isPublic={post.isPublic}
                      shareCount={formatCount(post.shares)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSave(post)}
                    disabled={isEngagementLoading || isEngagementUpdating}
                    aria-label={saved ? `Remove ${post.creator}'s post from saved` : `Save ${post.creator}'s post`}
                    aria-pressed={saved}
                    className={cn(
                      "zivo-post-action flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                      saved ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Bookmark size={20} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
                  </button>
                </div>
                {post.views && <p className="mt-2 text-xs font-bold text-muted-foreground">{post.views}</p>}
                {post.title && <h2 className="mt-2 text-base font-extrabold leading-6 text-card-foreground">{post.title}</h2>}
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-card-foreground">
                  <span className="mr-1 font-extrabold">{post.creator}</span>
                  {post.description ?? (post.title ? (post.caption === post.title ? "" : post.caption) : post.caption)}
                </p>
                {commentsOpen && (
                  <CommentThread
                    contentId={post.id}
                    contentType="post"
                    contentOwnerId={post.ownerId}
                    contentPreview={post.image}
                    onCountChange={(count) => updatePostCommentCount(post.id, count)}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p
        className="mx-auto max-w-md px-5 pb-2 pt-5 text-center text-xs font-semibold text-muted-foreground"
        aria-live="polite"
      >
        {shareMessage}
      </p>

      {activeStory && activeStoryIndex !== null && (
        <div
          ref={viewerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${activeStory.creator}'s story`}
          className="zivo-story-viewer fixed inset-0 z-50 flex bg-background text-foreground"
        >
          <div className="relative mx-auto size-full max-w-md overflow-hidden bg-card shadow-premium">
            <img
              data-genmb-img={activeStory.imageAlt}
              src={activeStory.image}
              alt={activeStory.imageAlt}
              className="absolute inset-0 size-full object-cover"
              onError={(event) => {
                event.currentTarget.src = `https://picsum.photos/seed/${activeStory.id}-fallback/1080/1920`;
              }}
            />
            <div
              className="absolute inset-0 bg-gradient-to-b from-background/75 via-transparent to-background"
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <div className="flex gap-1" aria-label={`Story ${activeStoryIndex + 1} of ${stories.length}`}>
                {stories.map((story, index) => (
                  <span key={story.id} className="h-1 flex-1 overflow-hidden rounded-full bg-card/45">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-100"
                      style={{
                        width: `${index < activeStoryIndex ? 100 : index === activeStoryIndex ? storyProgress : 0}%`,
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <img
                  data-genmb-img={`${activeStory.creator} story profile`}
                  src={activeStory.avatar}
                  alt={`${activeStory.creator} profile placeholder`}
                  className="size-10 rounded-full border border-card/70 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-card-foreground">{activeStory.creator}</p>
                  <p className="text-xs font-semibold text-card-foreground/80">{activeStory.timeLabel} · Fresh today</p>
                </div>
                <button
                  data-story-close
                  type="button"
                  onClick={closeStory}
                  aria-label="Close story"
                  className="flex size-11 items-center justify-center rounded-full bg-card/20 text-card-foreground backdrop-blur-sm transition-colors hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={22} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="absolute inset-y-20 left-0 z-10 w-1/2">
              <button
                type="button"
                onClick={previousStory}
                aria-label="Previous story"
                className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            </div>
            <div className="absolute inset-y-20 right-0 z-10 w-1/2">
              <button
                type="button"
                onClick={advanceStory}
                aria-label="Next story"
                className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-24">
              <p className="max-w-[85%] text-base font-bold leading-6 text-card-foreground">{activeStory.caption}</p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleListItem(activeStory.id, setLikedStories)}
                  aria-label={likedStories.includes(activeStory.id) ? "Unlike story" : "Like story"}
                  aria-pressed={likedStories.includes(activeStory.id)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full bg-card/20 text-card-foreground backdrop-blur-sm transition-colors hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    likedStories.includes(activeStory.id) && "text-primary",
                  )}
                >
                  <Heart
                    size={21}
                    fill={likedStories.includes(activeStory.id) ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                </button>
                <Link
                  to="/messages"
                  className="flex min-h-11 flex-1 items-center rounded-full bg-card/20 px-4 text-sm font-bold text-card-foreground backdrop-blur-sm transition-colors hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MessageCircle className="mr-2" size={20} aria-hidden="true" /> Reply
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    void sharePost({ ...posts[0], creator: activeStory.creator, caption: activeStory.caption })
                  }
                  aria-label="Share story"
                  className="flex size-11 items-center justify-center rounded-full bg-card/20 text-card-foreground backdrop-blur-sm transition-colors hover:bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Share2 size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
