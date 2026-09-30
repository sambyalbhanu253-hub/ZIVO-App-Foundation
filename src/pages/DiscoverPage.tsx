import { Check, Clapperboard, Play, Search, TrendingUp, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useFollowedCreators from "../hooks/useFollowedCreators";
import usePageMeta from "../hooks/usePageMeta";
import useSafetyRelationships from "../hooks/useSafetyRelationships";
import { ZivoEmptyState, ZivoInlineLoader } from "../components/ZivoState";
import { useAuth } from "../auth/AuthProvider";
import { actorFromUser, createNotification } from "../lib/notifications";
import { searchPersistedZivoData, type SearchCreatorResult, type ZivoSearchResults } from "../lib/discoverySearch";
import { cn } from "../lib/utils";

type ExploreCategory = {
  id: string;
  label: string;
  image: string;
};

const emptyResults: ZivoSearchResults = { content: [], creators: [], communities: [] };
const trendingSearches = ["Night markets", "Studio rituals", "Sunday trails", "Street style"];

const categories: ExploreCategory[] = [
  { id: "all", label: "All", image: "https://picsum.photos/seed/zivo-discover-all/160/160" },
  { id: "style", label: "Style", image: "https://picsum.photos/seed/zivo-discover-style/160/160" },
  { id: "food", label: "Food", image: "https://picsum.photos/seed/zivo-discover-food/160/160" },
  { id: "travel", label: "Travel", image: "https://picsum.photos/seed/zivo-discover-travel/160/160" },
  { id: "design", label: "Design", image: "https://picsum.photos/seed/zivo-discover-design/160/160" },
];

function contentLabel(format: "photo" | "short" | "video") {
  if (format === "short") return "Short";
  if (format === "video") return "Video";
  return "Post";
}

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchVersion, setSearchVersion] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [results, setResults] = useState<ZivoSearchResults>(emptyResults);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [status, setStatus] = useState("");

  const { user } = useAuth();
  const navigate = useNavigate();
  usePageMeta(
    "Discover on ZIVO — Premium Social Video",
    "Search real creators, posts, Shorts, videos, and communities on ZIVO.",
  );
  const { hiddenUserIds } = useSafetyRelationships();
  const {
    followedCreatorIds,
    isLoading: isFollowsLoading,
    updatingCreatorId,
    error: followError,
    toggleFollow,
  } = useFollowedCreators();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedQuery(searchTerm.trim()), 320);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    let active = true;

    const search = async () => {
      const query = debouncedQuery.trim();
      if (!query) {
        setResults(emptyResults);
        setSearchError("");
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setSearchError("");
      try {
        const nextResults = await searchPersistedZivoData(query);
        if (!active) return;
        setResults(nextResults);
        const count = nextResults.content.length + nextResults.creators.length + nextResults.communities.length;
        setStatus(
          count ? `${count} real ZIVO result${count === 1 ? "" : "s"} for ${query}.` : `No ZIVO results for ${query}.`,
        );
      } catch (error) {
        if (active) setSearchError(error instanceof Error ? error.message : "Unable to search ZIVO right now.");
      } finally {
        if (active) setIsSearching(false);
      }
    };

    void search();
    return () => {
      active = false;
    };
  }, [debouncedQuery, searchVersion]);

  const filteredContent = useMemo(() => {
    const visibleContent = results.content.filter((post) => !hiddenUserIds.includes(post.creatorId));
    if (selectedCategory === "all") return visibleContent;
    return visibleContent.filter((post) => {
      const searchable = `${post.caption} ${post.hashtags.join(" ")} ${post.category}`.toLowerCase();
      return searchable.includes(selectedCategory);
    });
  }, [hiddenUserIds, results.content, selectedCategory]);

  const visibleCreators = results.creators.filter((creator) => !hiddenUserIds.includes(creator.userId));
  const totalResults = filteredContent.length + visibleCreators.length + results.communities.length;
  const hasQuery = Boolean(debouncedQuery.trim());

  const applySearch = (term: string) => {
    const query = term.trim();
    setSearchTerm(term);
    setDebouncedQuery(query);
    setSearchVersion((version) => version + 1);
    setSelectedCategory("all");
    setStatus(query ? `Searching ZIVO for ${query}.` : "Enter a search to find ZIVO content.");
  };

  const clearSearch = () => {
    setSearchTerm("");
    setDebouncedQuery("");
    setSelectedCategory("all");
    setResults(emptyResults);
    setSearchError("");
    setStatus("Search cleared.");
  };

  const selectCategory = (category: ExploreCategory) => {
    setSelectedCategory(category.id);
    setStatus(
      category.id === "all" ? "Showing all matching content." : `Filtering matching content by ${category.label}.`,
    );
  };

  const handleFollow = async (creator: SearchCreatorResult) => {
    const result = await toggleFollow(creator.userId);
    if (!result) return;
    if (result.persisted && result.following && user) {
      try {
        await createNotification({
          dedupeId: `follow:${user.id}:${creator.userId}`,
          kind: "follow",
          recipientId: creator.userId,
          actor: await actorFromUser(user),
          message: "started following you.",
        });
      } catch (caughtError) {
        setStatus(
          `Following ${creator.displayName}. Saved to your account, but the notification could not be sent: ${caughtError instanceof Error ? caughtError.message : "unknown error"}`,
        );
        return;
      }
    }
    setStatus(
      result.persisted
        ? `${result.following ? "Following" : "Unfollowed"} ${creator.displayName}. Saved to your account.`
        : `${result.following ? "Following" : "Unfollowed"} ${creator.displayName} for this session. Sign in to save it.`,
    );
  };

  return (
    <section className="zivo-screen zivo-discover -mx-5 -mt-6 pb-2" aria-labelledby="page-title">
      <div className="mx-auto max-w-md px-5 pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Explore culture</p>
        <h1 id="page-title" className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground">
          Discover what&apos;s next.
        </h1>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch(searchTerm);
          }}
        >
          <label htmlFor="discover-search" className="sr-only">
            Search ZIVO Discover
          </label>
          <div className="zivo-discover-search flex min-h-14 items-center gap-3 rounded-[1.25rem] px-4 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30">
            <Search size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="discover-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search creators, videos, and ideas"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-card-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="min-h-9 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Search
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={17} className="text-primary" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-foreground">Trending searches</h2>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {trendingSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => applySearch(term)}
                className="zivo-discover-tag shrink-0 rounded-full px-4 py-2.5 text-xs font-bold text-card-foreground transition-all hover:border-primary/60 hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-[-0.035em] text-foreground">Explore categories</h2>
            <span className="text-xs font-semibold text-muted-foreground">Filter matches</span>
          </div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            {categories.map((category) => {
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category)}
                  aria-pressed={isSelected}
                  className="group flex w-16 shrink-0 flex-col items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      "zivo-discover-category relative size-16 overflow-hidden rounded-[1.25rem] border-2 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.03]",
                      isSelected ? "border-primary shadow-premium" : "border-border/70",
                    )}
                  >
                    <img
                      data-genmb-img={`${category.label} discovery category`}
                      src={category.image}
                      alt=""
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(event) => {
                        event.currentTarget.src = `https://picsum.photos/seed/zivo-discover-${category.id}-fallback/160/160`;
                      }}
                    />
                    <span className="absolute inset-0 bg-background/25" aria-hidden="true" />
                  </span>
                  <span className={cn("text-xs font-bold", isSelected ? "text-primary" : "text-muted-foreground")}>
                    {category.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-[-0.035em] text-foreground">Search results</h2>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                Real posts, Shorts, videos, creators, and communities on ZIVO
              </p>
            </div>
            {hasQuery && !isSearching && <span className="text-xs font-bold text-primary">{totalResults} found</span>}
          </div>

          {isSearching ? (
            <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-xs font-semibold text-muted-foreground shadow-premium">
              <ZivoInlineLoader label="Searching ZIVO…" />
            </div>
          ) : searchError ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-primary/45 bg-accent px-4 py-3 text-sm font-semibold text-card-foreground"
            >
              Search is unavailable right now: {searchError}
            </p>
          ) : !hasQuery ? (
            <ZivoEmptyState
              className="zivo-discover-empty mt-4"
              title="Search the real ZIVO community."
              description="Look up a caption, hashtag, creator, video, Short, or community."
            />
          ) : totalResults === 0 ? (
            <ZivoEmptyState
              className="zivo-discover-empty mt-4"
              title="No ZIVO results match that search."
              description="Try a shorter phrase, a creator name, or a hashtag."
              action={{ label: "Clear search", onClick: clearSearch }}
            />
          ) : (
            <div className="mt-4 space-y-8">
              {filteredContent.length > 0 && (
                <section aria-labelledby="content-results-title">
                  <div className="flex items-center gap-2">
                    <Clapperboard size={17} className="text-primary" aria-hidden="true" />
                    <h3 id="content-results-title" className="text-sm font-extrabold text-foreground">
                      Content
                    </h3>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {filteredContent.map((post) => {
                      const destination =
                        post.format === "short"
                          ? `/shorts/${encodeURIComponent(post.id)}`
                          : `/content/${encodeURIComponent(post.id)}`;
                      const mediaUrl = post.mediaUrl || post.mediaRef;
                      return (
                        <article
                          key={post.id}
                          className="group relative aspect-[3/4] overflow-hidden rounded-[1.25rem] border border-border/70 bg-muted shadow-premium"
                        >
                          <button
                            type="button"
                            onClick={() => navigate(destination)}
                            aria-label={`Open ${contentLabel(post.format).toLowerCase()} by ${post.creatorName}`}
                            className="size-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {post.mediaType === "video" ? (
                              <video
                                src={mediaUrl}
                                muted
                                playsInline
                                preload="metadata"
                                className="size-full object-cover"
                                aria-label={post.mediaAlt}
                              />
                            ) : (
                              <img
                                data-genmb-img={post.mediaAlt}
                                src={mediaUrl}
                                alt={post.mediaAlt}
                                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                onError={(event) => {
                                  event.currentTarget.src = `https://picsum.photos/seed/zivo-search-${post.id}-fallback/600/760`;
                                }}
                              />
                            )}
                            <span
                              className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent"
                              aria-hidden="true"
                            />
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg bg-background/75 px-2 py-1 text-[10px] font-extrabold text-foreground backdrop-blur-sm">
                              <Play size={11} fill="currentColor" aria-hidden="true" />
                              {contentLabel(post.format)}
                            </span>
                            <span className="absolute inset-x-0 bottom-0 p-3">
                              <span className="block truncate text-sm font-extrabold text-foreground">
                                {post.caption}
                              </span>
                              <span className="mt-0.5 block truncate text-xs font-semibold text-foreground/75">
                                {post.creatorHandle}
                              </span>
                            </span>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {visibleCreators.length > 0 && (
                <section aria-labelledby="creator-results-title">
                  <div className="flex items-center gap-2">
                    <UsersRound size={17} className="text-primary" aria-hidden="true" />
                    <h3 id="creator-results-title" className="text-sm font-extrabold text-foreground">
                      Creators
                    </h3>
                  </div>
                  <div className="mt-3 space-y-3">
                    {visibleCreators.map((creator) => {
                      const isFollowing = followedCreatorIds.includes(creator.userId);
                      const avatar =
                        creator.avatarUrl ||
                        `https://picsum.photos/seed/zivo-creator-${encodeURIComponent(creator.userId)}/96/96`;
                      return (
                        <article
                          key={creator.userId}
                          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-premium"
                        >
                          <button
                            type="button"
                            onClick={() => navigate(`/profile/${encodeURIComponent(creator.userId)}`)}
                            aria-label={`View ${creator.displayName}'s profile`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <img
                              data-genmb-img={`${creator.displayName} creator profile`}
                              src={avatar}
                              alt=""
                              className="size-11 rounded-full border border-border object-cover"
                              onError={(event) => {
                                event.currentTarget.src = `https://picsum.photos/seed/zivo-search-creator-${creator.userId}/96/96`;
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-extrabold text-card-foreground">
                                {creator.displayName}
                              </span>
                              <span className="block truncate text-xs font-semibold text-muted-foreground">
                                {creator.username}
                                {creator.bio ? ` · ${creator.bio}` : ""}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleFollow(creator)}
                            disabled={isFollowsLoading || updatingCreatorId === creator.userId}
                            aria-pressed={isFollowing}
                            className={cn(
                              "min-h-10 rounded-xl px-3 text-xs font-extrabold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isFollowing
                                ? "border border-border bg-muted text-card-foreground"
                                : "bg-primary text-primary-foreground shadow-premium active:scale-[0.98]",
                              "disabled:cursor-not-allowed disabled:opacity-60",
                            )}
                          >
                            {isFollowing && <Check size={14} className="mr-1 inline" aria-hidden="true" />}
                            {updatingCreatorId === creator.userId ? "Saving…" : isFollowing ? "Following" : "Follow"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {results.communities.length > 0 && (
                <section aria-labelledby="community-results-title">
                  <div className="flex items-center gap-2">
                    <UsersRound size={17} className="text-primary" aria-hidden="true" />
                    <h3 id="community-results-title" className="text-sm font-extrabold text-foreground">
                      Communities
                    </h3>
                  </div>
                  <div className="mt-3 space-y-3">
                    {results.communities.map((community) => (
                      <Link
                        key={community.id}
                        to={`/communities/${encodeURIComponent(community.slug)}`}
                        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-premium transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {community.avatarUrl ? (
                          <img
                            data-genmb-img={`${community.name} community`}
                            src={community.avatarUrl}
                            alt=""
                            className="size-11 rounded-xl border border-border object-cover"
                            onError={(event) => {
                              event.currentTarget.src = `https://picsum.photos/seed/zivo-community-${community.slug}/96/96`;
                            }}
                          />
                        ) : (
                          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
                            <UsersRound size={20} aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold text-card-foreground">
                            {community.name}
                          </span>
                          <span className="block truncate text-xs font-semibold text-muted-foreground">
                            {community.description}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {followError && (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-primary/45 bg-accent px-4 py-3 text-sm font-semibold text-card-foreground"
          >
            {followError}
          </p>
        )}
        <div className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary"
              aria-hidden="true"
            >
              <UsersRound size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-card-foreground">Find your community</h2>
              <p className="mt-0.5 text-xs font-medium leading-5 text-muted-foreground">
                Explore persistent spaces built around the culture you love.
              </p>
            </div>
            <Link
              to="/communities"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Explore
            </Link>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
