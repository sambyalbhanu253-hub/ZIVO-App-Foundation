import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Eye,
  Heart,
  MessageCircle,
  Radio,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ZivoEmptyState, ZivoErrorState, ZivoLoadingState } from "../components/ZivoState";
import usePageMeta from "../hooks/usePageMeta";
import {
  analyticsPeriodLabel,
  filterCreatorAnalytics,
  loadCreatorAnalytics,
  type AnalyticsPeriod,
  type CreatorAnalyticsSnapshot,
} from "../lib/creatorAnalytics";

const periods: Array<{ id: AnalyticsPeriod; label: string }> = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "all", label: "All time" },
];

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(timestamp),
  );
}

function contentLabel(format: "photo" | "short" | "video") {
  return format === "short" ? "Short" : format === "video" ? "Video" : "Post";
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function CreatorAnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<AnalyticsPeriod>("30");
  const [snapshot, setSnapshot] = useState<CreatorAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  usePageMeta("Creator analytics | ZIVO", "Private, persisted creator analytics for your ZIVO account.");

  const load = useCallback(
    async (refresh = false) => {
      if (!user) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const next = await loadCreatorAnalytics(user.id);
        setSnapshot(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load creator analytics.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, load, user]);

  const data = useMemo(() => (snapshot ? filterCreatorAnalytics(snapshot, period) : null), [period, snapshot]);
  const earningsByCurrency = useMemo(() => {
    if (!data) return [];
    return Object.entries(
      data.earnings.reduce<Record<string, number>>((totals, record) => {
        totals[record.currency] = (totals[record.currency] || 0) + record.amount;
        return totals;
      }, {}),
    );
  }, [data]);

  if (authLoading || loading) return <ZivoLoadingState label="Loading your creator analytics…" />;
  if (!user) {
    return (
      <ZivoEmptyState
        title="Creator analytics are private"
        description="Sign in to view analytics for your own ZIVO creator account."
        action={{ label: "Sign in", onClick: () => navigate("/sign-in") }}
      />
    );
  }
  if (!snapshot || !data) {
    return (
      <ZivoErrorState
        title="Analytics unavailable"
        description={error || "Your private analytics could not be opened."}
        action={{ label: "Back to profile", onClick: () => navigate("/profile") }}
      />
    );
  }

  return (
    <section className="zivo-screen" aria-labelledby="analytics-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="zivo-icon-button flex size-10 items-center justify-center border border-border bg-card text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Back to profile"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator tools</p>
            <h1 id="analytics-title" className="mt-1 text-2xl font-extrabold tracking-[-0.065em] text-foreground">
              Analytics
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="zivo-icon-button flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <RefreshCw
            size={15}
            className={refreshing ? "animate-spin text-primary" : "text-primary"}
            aria-hidden="true"
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-primary/45 bg-accent px-3 py-2.5 text-xs font-semibold text-card-foreground"
        >
          {error}
        </p>
      )}

      <div
        className="mt-5 flex gap-2 rounded-2xl border border-border bg-card p-1.5"
        role="tablist"
        aria-label="Analytics time period"
      >
        {periods.map((item) => {
          const selected = item.id === period;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setPeriod(item.id)}
              className={
                selected
                  ? "min-h-10 flex-1 rounded-xl bg-primary px-2 text-xs font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  : "min-h-10 flex-1 rounded-xl px-2 text-xs font-extrabold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <section className="mt-5" aria-labelledby="overview-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Overview</p>
            <h2 id="overview-title" className="mt-1 text-lg font-extrabold tracking-[-0.045em] text-foreground">
              Your activity
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{analyticsPeriodLabel(period)}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { label: "Total Views", value: "Unavailable", icon: Eye, note: "View events are not stored yet." },
            { label: "Total Likes", value: String(data.totalLikes), icon: Heart, note: analyticsPeriodLabel(period) },
            {
              label: "Total Comments",
              value: String(data.totalComments),
              icon: MessageCircle,
              note: analyticsPeriodLabel(period),
            },
            { label: "Followers", value: String(data.followerCount), icon: Users, note: "Current total" },
            {
              label: "Followers gained",
              value: String(data.followersGained),
              icon: Users,
              note: analyticsPeriodLabel(period),
            },
          ].map(({ label, value, icon: Icon, note }) => (
            <article key={label} className="rounded-2xl border border-border bg-card p-3 shadow-premium">
              <Icon size={16} className="text-primary" aria-hidden="true" />
              <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                {label}
              </p>
              <p
                className={
                  value === "Unavailable"
                    ? "mt-1 text-base font-extrabold text-card-foreground"
                    : "mt-1 text-2xl font-extrabold tracking-[-0.06em] text-card-foreground"
                }
              >
                {value}
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-labelledby="top-content-title">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-primary" aria-hidden="true" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Top content</p>
            <h2 id="top-content-title" className="mt-1 text-lg font-extrabold tracking-[-0.045em] text-foreground">
              By recorded engagement
            </h2>
          </div>
        </div>
        {data.topContent.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-border bg-card p-4 shadow-premium">
            <p className="text-sm font-extrabold text-card-foreground">No recorded engagement yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Top content will appear after your posts receive persisted likes, comments, or saves.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {data.topContent.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  navigate(
                    item.format === "short"
                      ? `/shorts/${encodeURIComponent(item.id)}`
                      : `/content/${encodeURIComponent(item.id)}`,
                  )
                }
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-extrabold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-card-foreground">{item.title}</span>
                  <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                    {item.likes} likes · {item.comments} comments · {item.saves} saves
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="performance-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Content performance</p>
            <h2 id="performance-title" className="mt-1 text-lg font-extrabold tracking-[-0.045em] text-foreground">
              Published in this period
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{data.content.length} items</p>
        </div>
        {data.content.length === 0 ? (
          <ZivoEmptyState
            title="No content in this period"
            description="Choose a longer time range to view your earlier posts, Shorts, and videos."
          />
        ) : (
          <div className="mt-3 space-y-2">
            {data.content.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  navigate(
                    item.format === "short"
                      ? `/shorts/${encodeURIComponent(item.id)}`
                      : `/content/${encodeURIComponent(item.id)}`,
                  )
                }
                className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-full bg-accent px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">
                      {contentLabel(item.format)}
                    </span>
                    <p className="mt-2 truncate text-sm font-extrabold text-card-foreground">{item.title}</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      <CalendarDays size={13} className="mr-1 inline-block" aria-hidden="true" />
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground">Views unavailable</span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs font-bold text-muted-foreground">
                  <span>
                    <Heart size={14} className="mr-1 inline-block text-primary" aria-hidden="true" />
                    {item.likes}
                  </span>
                  <span>
                    <MessageCircle size={14} className="mr-1 inline-block text-primary" aria-hidden="true" />
                    {item.comments}
                  </span>
                  <span>
                    <Save size={14} className="mr-1 inline-block text-primary" aria-hidden="true" />
                    {item.saves}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-3" aria-label="Creator earnings and live data">
        <article className="rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-card-foreground">Earnings</h2>
          </div>
          {earningsByCurrency.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-muted-foreground">Earnings data not available yet</p>
          ) : (
            <div className="mt-3 space-y-1">
              {earningsByCurrency.map(([currency, total]) => (
                <p key={currency} className="text-xl font-extrabold tracking-[-0.05em] text-card-foreground">
                  {money(total, currency)}{" "}
                  <span className="text-xs font-semibold text-muted-foreground">estimated</span>
                </p>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate("/creator/monetization")}
            className="mt-3 text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open monetization
          </button>
        </article>
        <article className="rounded-2xl border border-border bg-card p-4 shadow-premium">
          <div className="flex items-center gap-2">
            <Radio size={18} className="text-primary" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-card-foreground">Live</h2>
          </div>
          <p className="mt-2 text-sm font-semibold text-card-foreground">
            {data.liveSessions.length} {data.liveSessions.length === 1 ? "live session" : "live sessions"}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {data.viewerDataAvailable
              ? `${data.recordedViewerCount} current viewers recorded across sessions with available viewer data.`
              : "Viewer data not available yet."}
          </p>
        </article>
      </section>
      <p className="mt-6 text-center text-xs font-semibold text-muted-foreground">
        Only you can view analytics for this creator account.
      </p>
    </section>
  );
}
