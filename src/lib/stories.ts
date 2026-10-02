import { loadStoredProfile } from './profiles';

export type StoredStory = {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  content: string;
  mediaRef: string;
  mediaAlt: string;
  createdAt: number;
  expiresAt: number;
};

export const storyPrefix = "zivo:story:";
const storyDurationMs = 24 * 60 * 60 * 1000;

export function readStoredStory(value: unknown): StoredStory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const story = value as Record<string, unknown>;
  if (
    typeof story.id !== 'string' ||
    typeof story.creatorId !== 'string' ||
    typeof story.creatorName !== 'string' ||
    typeof story.creatorAvatar !== 'string' ||
    typeof story.content !== 'string' ||
    typeof story.mediaRef !== 'string' ||
    typeof story.mediaAlt !== 'string' ||
    typeof story.createdAt !== 'number' ||
    typeof story.expiresAt !== 'number'
  ) {
    return null;
  }

  return {
    id: story.id,
    creatorId: story.creatorId,
    creatorName: story.creatorName,
    creatorAvatar: story.creatorAvatar,
    content: story.content,
    mediaRef: story.mediaRef,
    mediaAlt: story.mediaAlt,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
  };
}

export async function loadActiveStories(now = Date.now()): Promise<StoredStory[]> {
  try {
    if (!window.genmb?.kv?.list) {
      return [];
    }
    const result = await window.genmb.kv.list(storyPrefix);
    if (!result || !result.data) {
      return [];
    }
    return result.data
      .map((entry) => readStoredStory(entry.value))
      .filter((story): story is StoredStory => Boolean(story && story.expiresAt > now))
      .sort((first, second) => second.createdAt - first.createdAt);
  } catch (error) {
    console.warn("Failed to load stories from KV:", error);
    return [];
  }
}

export async function createStory(
  user: GenMBUser,
  content: string,
  media: { url: string; filename: string; contentType: string; size: number; alt: string },
): Promise<StoredStory> {
  if (!content.trim()) throw new Error('Add a caption before publishing.');
  if (!media.url.trim() && !media.filename.trim()) {
    throw new Error('Upload your photo or video before publishing.');
  }

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const storedProfile = readStoredProfile(window.genmb.kv.get(`zivo-profile:${user.id}`));
  const fallbackName = user.email.split('@')[0] || 'ZIVO creator';
  const creatorName = storedProfile?.displayName.trim() || fallbackName;
  const creatorAvatar = storedProfile?.avatarUri || user.picture || `https://picsum.photos/seed/zivo-story-${user.id}-avatar/96/96`;

  const story: StoredStory = {
    id,
    creatorId: user.id,
    creatorName,
    creatorAvatar,
    content: content.trim(),
    mediaRef: media.url,
    mediaAlt: media.alt.trim() || `${creatorName}'s story moment`,
    createdAt,
    expiresAt: createdAt + storyDurationMs,
  };

  await window.genmb.kv.set(`${storyPrefix}${id}`, story);
  return story;
}
