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
import { useAuth } from "../auth/AuthProvider";
import { actorFromUser, createNotification } from "../lib/notifications";
import { loadLiveSessions, type ZivoLiveSession } from "../lib/live";
import { loadPosts, loadShorts, localPostPublishedEvent, localPostUpdatedEvent, localPostDeletedEvent, type StoredPost } from "../lib/posts";
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
  thumbnailUrl?: string;
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
    thumbnailUrl: post.thumbnailUrl,
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
    thumbnailUrl: post.thumbnailUrl,
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

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedTab>("for-you");
  const [persistedPosts, setPersistedPosts] = useState<Post[]>([]);
  const [persistedShorts, setPersistedShorts] = useState<Post[]>([]);
  const [persistedStories, setPersistedStories] = useState<Story[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState("");
  const [feedMessage, setFeedMessage] = useState("");
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  usePageMeta("ZIVO Home — Premium Social Video", "Explore a curated feed of premium social video on ZIVO.");
  const { followedCreatorIds, toggleFollow } = useFollowedCreators();
  const { toggleSave } = useVideoEngagement();

  const likeTargets = [...persistedShorts, ...persistedPosts, ...posts].map((post) => ({ id: post.id, contentType: "post" as const }));
  const { toggleLike } = usePersistentLikes(likeTargets);
  const { hiddenUserIds } = useSafetyRelationships();

  // Combine regular posts and shorts so both appear in the home feed
  const combinedAllPosts = [...persistedShorts, ...persistedPosts, ...posts];
  const feedPosts = combinedAllPosts.filter(
    (post) => post.isPublic && !hiddenUserIds.includes(post.ownerId),
  );

  const visiblePosts =
    activeTab === "for-you" ? feedPosts : feedPosts.filter((post) => followedCreatorIds.includes(post.ownerId));

  const stories = [
    ...persistedStories.filter((story) => !story.expiresAt || story.expiresAt > Date.now()),
    ...demoStories,
  ];

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setIsPostsLoading(true);
      try {
        const [loadedPosts, loadedShorts, loadedStories] = await Promise.all([
          loadPosts().catch(() => [] as StoredPost[]),
          loadShorts ? loadShorts().catch(() => [] as StoredPost[]) : Promise.resolve([] as StoredPost[]),
          loadActiveStories().catch(() => [] as StoredStory[])
        ]);
        if (active) {
          setPersistedPosts(loadedPosts.map(postFromStored));
          setPersistedShorts(loadedShorts.map(postFromStored));
          setPersistedStories(loadedStories.map(storyFromStored));
        }
      } catch (error) {
        if (active) setPostsError(error instanceof Error ? error.message : "Unable to load feed.");
      } finally {
        if (active) setIsPostsLoading(false);
      }
    };
    void loadData();
    return () => { active = false; };
  }, [location.key]);

  return (
    <section ref={pullRef} className="-mx-5 -mt-5" aria-labelledby="page-title">
      <h1 id="page-title" className="sr-only">ZIVO home feed</h1>
      <div className="home-feed-tabs z-30 border-b border-border/60 bg-background px-5 pt-2">
        <div className="mx-auto flex max-w-md items-center justify-between" role="tablist" aria-label="Home feed">
          <div className="flex gap-8">
            {(["for-you", "Following"] as const).map(([tab, label]) => {
              const tabKey = tab.toLowerCase() === "following" ? "following" : "for-you";
              return (
                <button
                  key={tabKey}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tabKey}
                  onClick={() => setActiveTab(tabKey)}
                  className={cn(
                    "relative min-h-11 pb-2.5 text-sm font-extrabold transition-colors",
                    activeTab === tabKey ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-6 px-5 pt-5">
        {postsError && <p className="text-xs text-red-500">{postsError}</p>}
        {isPostsLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading feed...</p>
        ) : visiblePosts.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">No videos or shorts available in the feed yet.</p>
        ) : (
          visiblePosts.map((post) => (
            <div key={post.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <img src={post.avatar} alt={post.creator} className="size-10 rounded-full object-cover" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">{post.creator}</h3>
                  <p className="text-xs text-muted-foreground">{post.handle}</p>
                </div>
              </div>
              <p className="text-sm text-foreground">{post.caption}</p>
              {post.image && (
                <div className="relative aspect-[9/16] max-h-[480px] w-full overflow-hidden rounded-xl bg-black">
                  <video
                    src={post.videoUrl || post.mediaUrl}
                    poster={post.image}
                    controls
                    className="size-full object-cover"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
