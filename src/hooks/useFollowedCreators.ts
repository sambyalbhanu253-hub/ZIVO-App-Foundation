import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { canInteractBetween } from "../lib/safety";

export type FollowRelationship = {
  followerId: string;
  targetId: string;
  createdAt: number;
};

type FollowToggleResult = {
  following: boolean;
  persisted: boolean;
};

export function followPrefix(followerId: string) {
  return `zivo:follow:${followerId}:`;
}

export function readFollowRelationship(value: unknown): FollowRelationship | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const relationship = value as Record<string, unknown>;
  if (
    typeof relationship.followerId !== "string" ||
    typeof relationship.targetId !== "string" ||
    typeof relationship.createdAt !== "number"
  ) {
    return null;
  }
  return {
    followerId: relationship.followerId,
    targetId: relationship.targetId,
    createdAt: relationship.createdAt,
  };
}

export default function useFollowedCreators() {
  const { user, loading: isAuthLoading } = useAuth();
  const [followedCreatorIds, setFollowedCreatorIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingCreatorId, setUpdatingCreatorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const followedCreatorIdsRef = useRef<string[]>([]);

  useEffect(() => {
    followedCreatorIdsRef.current = followedCreatorIds;
  }, [followedCreatorIds]);

  useEffect(() => {
    let active = true;

    const loadFollows = async () => {
      if (isAuthLoading) return;
      setError("");

      if (!user) {
        if (active) {
          followedCreatorIdsRef.current = [];
          setFollowedCreatorIds([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const result = await window.genmb.kv.list(followPrefix(user.id));
        const storedFollows = [...new Set(
          result.data
            .map((record) => readFollowRelationship(record.value))
            .filter((relationship): relationship is FollowRelationship => Boolean(relationship && relationship.followerId === user.id))
            .map((relationship) => relationship.targetId)
            .filter((targetId) => targetId !== user.id),
        )];
        if (active) {
          followedCreatorIdsRef.current = storedFollows;
          setFollowedCreatorIds(storedFollows);
        }
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to load followed creators.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadFollows();
    return () => {
      active = false;
    };
  }, [isAuthLoading, user]);

  const toggleFollow = useCallback(
    async (targetId: string): Promise<FollowToggleResult | null> => {
      if (!targetId || updatingCreatorId) return null;
      if (!user) {
        setError("Sign in to follow creators and save your feed.");
        return null;
      }
      if (targetId === user.id) {
        setError("You cannot follow your own profile.");
        return null;
      }
      if (!(await canInteractBetween(user.id, targetId))) {
        setError("This interaction is unavailable because one of you has blocked the other.");
        return null;
      }

      const currentIds = followedCreatorIdsRef.current;
      const following = !currentIds.includes(targetId);
      const relationshipKey = `${followPrefix(user.id)}${targetId}`;

      setUpdatingCreatorId(targetId);
      setError("");
      try {
        const result = following ? await window.genmb.social.follow(targetId) : await window.genmb.social.unfollow(targetId);
        if (following) {
          const relationship: FollowRelationship = { followerId: user.id, targetId, createdAt: Date.now() };
          await window.genmb.kv.set(relationshipKey, relationship);
        } else {
          await window.genmb.kv.delete(relationshipKey);
        }
        const nextIds = result.following ? [...currentIds, targetId] : currentIds.filter((id) => id !== targetId);
        followedCreatorIdsRef.current = nextIds;
        setFollowedCreatorIds(nextIds);
        return { following: result.following, persisted: true };
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to update followed creators.");
        return null;
      } finally {
        setUpdatingCreatorId(null);
      }
    },
    [updatingCreatorId, user],
  );

  return {
    followedCreatorIds,
    isLoading,
    updatingCreatorId,
    error,
    toggleFollow,
  };
}
