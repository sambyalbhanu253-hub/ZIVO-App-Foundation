import {
  ArrowLeft,
  BadgeDollarSign,
  CalendarDays,
  CircleDollarSign,
  Gift,
  LockKeyhole,
  Radio,
  ReceiptText,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { loadCreatorAnalytics } from "../lib/creatorAnalytics";
import { ZivoEmptyState, ZivoErrorState, ZivoInlineLoader, ZivoLoadingState } from "../components/ZivoState";
import usePageMeta from "../hooks/usePageMeta";
import {
  loadCreatorEarningRecords,
  monetizationTargets,
  loadCreatorMonetizationSettings,
  updateCreatorMonetizationSettings,
  type CreatorEarningRecord,
  type CreatorMonetizationSettings,
} from "../lib/monetization";

const statusCopy = {
  "not-eligible": {
    label: "Not eligible",
    description:
      "ZIVO monetization review is not connected yet. Your content stays unchanged while the program is prepared.",
  },
  eligible: {
    label: "Eligible",
    description: "Your account has passed the future eligibility rules. Enable only when you are ready to participate.",
  },
  enabled: {
    label: "Enabled",
    description:
      "Monetization is enabled. Revenue sources still require a connected provider before earnings can be generated.",
  },
  disabled: {
    label: "Disabled",
    description:
      "Monetization was turned off for this creator. You can re-enable it after a future eligibility review.",
  },
} as const;

const featureRows = [
  ["Advertising revenue", "Available after a revenue provider is connected.", "advertising"],
  ["Live gifts & subscriptions", "Live earnings are not connected yet.", "live-gifts"],
  ["Memberships", "Membership billing is planned for a future release.", "memberships"],
  ["Promotions & sponsorships", "Future campaign records will appear here.", "promotions"],
] as const;

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function recordLabel(record: CreatorEarningRecord) {
  return {
    advertising: "Advertising revenue",
    "live-gift": "Live gift",
    membership: "Membership",
    promotion: "Creator promotion",
    sponsorship: "Sponsorship",
  }[record.type];
}

export default function CreatorMonetizationPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CreatorMonetizationSettings | null>(null);
  const [records, setRecords] = useState<CreatorEarningRecord[]>([]);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [period, setPeriod] = useState<"30" | "all">("30");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  usePageMeta("Creator monetization | ZIVO", "Private creator monetization status and earnings on ZIVO.");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [nextSettings, nextRecords, analytics] = await Promise.all([
          loadCreatorMonetizationSettings(user.id),
          loadCreatorEarningRecords(user.id),
          loadCreatorAnalytics(user.id),
        ]);
        if (active) {
          setSettings(nextSettings);
          setRecords(nextRecords);
          setFollowerCount(analytics.followerCount);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load creator monetization.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  const visibleRecords = useMemo(() => {
    if (period === "all") return records;
    const start = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return records.filter((record) => record.timestamp >= start);
  }, [period, records]);
  const currency = visibleRecords[0]?.currency || records[0]?.currency || "USD";
  const total = visibleRecords
    .filter((record) => record.currency === currency && record.status !== "reversed")
    .reduce((sum, record) => sum + record.amount, 0);
  const byType = visibleRecords.reduce<Record<string, number>>((summary, record) => {
    if (record.status !== "reversed" && record.currency === currency)
      summary[record.type] = (summary[record.type] || 0) + record.amount;
    return summary;
  }, {});

  const toggle = async () => {
    if (!user || !settings || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await updateCreatorMonetizationSettings({
        creatorId: user.id,
        enabled: settings.status === "eligible",
      });
      setSettings(next);
      setNotice(next.status === "enabled" ? "Monetization settings saved." : "Monetization has been disabled.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save monetization settings.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <ZivoLoadingState label="Loading creator monetization…" />;
  if (!user)
    return (
      <ZivoEmptyState
        title="Creator dashboard is private"
        description="Sign in to view the monetization settings and earnings for your own ZIVO account."
        action={{ label: "Sign in", onClick: () => navigate("/sign-in") }}
      />
    );
  if (!settings)
    return (
      <ZivoErrorState
        title="Monetization unavailable"
        description={error || "Your private creator dashboard could not be opened."}
      />
    );

  const canToggle = settings.status === "eligible" || settings.status === "enabled";
  return (
    <section className="zivo-screen" aria-labelledby="monetization-title">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="zivo-icon-button flex size-10 items-center justify-center border border-border bg-card text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to profile"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Creator tools</p>
          <h1 id="monetization-title" className="mt-1 text-2xl font-extrabold tracking-[-0.065em] text-foreground">
            Monetization
          </h1>
        </div>
      </div>
      {(error || notice) && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2.5 text-xs font-bold ${error ? "border-primary/50 bg-accent text-card-foreground" : "border-primary/35 bg-card text-card-foreground"}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-primary/30 bg-card p-4 shadow-premium">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BadgeDollarSign size={20} />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Program status</p>
            <h2 className="mt-1 text-lg font-extrabold text-card-foreground">{statusCopy[settings.status].label}</h2>
            <p className="mt-1 text-sm font-medium leading-5 text-muted-foreground">
              {statusCopy[settings.status].description}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!canToggle || saving}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 text-sm font-extrabold text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55"
        >
          <>
            {settings.status === "enabled" ? (
              <ToggleRight size={19} className="text-primary" />
            ) : (
              <ToggleLeft size={19} />
            )}
          </>
          {saving
            ? "Saving…"
            : settings.status === "enabled"
              ? "Disable monetization"
              : settings.status === "eligible"
                ? "Enable monetization"
                : "Eligibility review required"}
        </button>
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-premium">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Creator program policy</p>
        <h2 className="mt-1 text-lg font-extrabold text-card-foreground">Two ways to qualify</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Both paths require {monetizationTargets.followers.toLocaleString()} followers and{" "}
          {monetizationTargets.longVideoWatchHours} hours of long-video watch time. Then meet either Shorts goal below.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-muted/60 p-3">
          <p className="text-sm font-extrabold text-card-foreground">Shared requirements</p>
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>Followers</span>
            <span>
              {followerCount === null
                ? "Unavailable"
                : `${followerCount.toLocaleString()} / ${monetizationTargets.followers.toLocaleString()}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Follower goal"
            aria-valuemin={0}
            aria-valuemax={monetizationTargets.followers}
            aria-valuenow={Math.min(followerCount ?? 0, monetizationTargets.followers)}
            className="mt-2 h-2 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, ((followerCount ?? 0) / monetizationTargets.followers) * 100)}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>Long-video watch time</span>
            <span>Not tracked / {monetizationTargets.longVideoWatchHours} hours</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-border" aria-label="Watch time progress unavailable" />
        </div>
        <div className="mt-3 grid gap-3">
          <div className="rounded-xl border border-border bg-muted/60 p-3">
            <p className="text-sm font-extrabold text-card-foreground">Path 1 · Standard views</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {monetizationTargets.standardShortViews.toLocaleString()} Shorts views
            </p>
            <p className="mt-1 text-xs font-semibold text-primary">
              Progress unavailable · Shorts views are not tracked
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/60 p-3">
            <p className="text-sm font-extrabold text-card-foreground">Path 2 · Community engagement</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {monetizationTargets.communityShortViews.toLocaleString()} Shorts views plus at least{" "}
              {monetizationTargets.communityEngagementPercent}% genuine engagement (likes, comments and shares relative
              to Shorts views).
            </p>
            <p className="mt-1 text-xs font-semibold text-primary">
              Progress unavailable · verified views and shares are not tracked
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          These are proposed eligibility targets, not an active earnings promise. View/watch-time verification,
          anti-abuse checks and program review are not connected; reaching a displayed target does not enable payments
          automatically.
        </p>
        <div className="mt-4 border-t border-border pt-4" aria-labelledby="policy-details-title">
          <h3 id="policy-details-title" className="text-sm font-extrabold text-card-foreground">Policy & review settings</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-5 text-muted-foreground">
            <li>Eligibility is subject to a future account and content review; the goals above are informational only.</li>
            <li>Views, watch time and engagement will need verification before they can count toward eligibility.</li>
            <li>Advertising, gifts, memberships and payouts are not active or connected in ZIVO yet.</li>
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            There are no creator-editable policy rules or payout settings at this time. This page displays the proposed
            program criteria and your private account status; it does not activate payments.
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-premium">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Earnings</p>
            <h2 className="mt-1 text-lg font-extrabold text-card-foreground">Estimated activity</h2>
          </div>
          <label className="sr-only" htmlFor="earnings-period">
            Earnings period
          </label>
          <select
            id="earnings-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value as "30" | "all")}
            className="min-h-10 rounded-xl border border-border bg-muted px-2 text-xs font-bold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
          >
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <div className="mt-4 rounded-xl border border-border/80 bg-background/45 p-4">
          <p className="text-xs font-bold text-muted-foreground">
            {period === "30" ? "Last 30 days" : "All recorded activity"}
          </p>
          <p className="mt-1 text-3xl font-extrabold tracking-[-0.07em] text-card-foreground">
            {money(total, currency)}
          </p>
          <p className="mt-2 text-xs font-medium leading-5 text-muted-foreground">
            Estimated only. No revenue provider is connected, and ZIVO has not generated any earnings records for this
            account.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ["Posts & videos", byType.advertising || 0],
            ["Live", byType["live-gift"] || 0],
          ].map(([label, amount]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-muted/60 p-3">
              <p className="text-xs font-bold text-muted-foreground">{label}</p>
              <p className="mt-1 text-base font-extrabold text-card-foreground">{money(Number(amount), currency)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-premium">
        <div className="flex items-center gap-2">
          <Sparkles size={17} className="text-primary" />
          <h2 className="text-base font-extrabold text-card-foreground">Earning features</h2>
        </div>
        <div className="mt-3 divide-y divide-border">
          {featureRows.map(([title, description, feature]) => (
            <div key={feature} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="mt-0.5 text-primary">
                {feature === "live-gifts" ? (
                  <Gift size={17} />
                ) : feature === "advertising" ? (
                  <CircleDollarSign size={17} />
                ) : feature === "memberships" ? (
                  <LockKeyhole size={17} />
                ) : (
                  <Radio size={17} />
                )}
              </span>
              <div>
                <p className="text-sm font-extrabold text-card-foreground">{title}</p>
                <p className="mt-0.5 text-xs font-medium leading-5 text-muted-foreground">
                  {settings.features[feature] ? "Enabled for future provider connection." : description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <ReceiptText size={18} className="text-primary" />
          <h2 className="text-base font-extrabold text-foreground">Earning history</h2>
        </div>
        {visibleRecords.length === 0 ? (
          <ZivoEmptyState
            title="No earning records"
            description="When a verified revenue source is connected, immutable estimated and payout records will appear privately here."
          />
        ) : (
          <div className="space-y-2">
            {visibleRecords.map((record) => (
              <article key={record.earningId} className="rounded-xl border border-border bg-card p-3 shadow-premium">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-card-foreground">{recordLabel(record)}</p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground">
                      <CalendarDays className="mr-1 inline-block" size={13} />
                      {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
                        new Date(record.timestamp),
                      )}{" "}
                      · {record.status}
                    </p>
                  </div>
                  <p className="text-sm font-extrabold text-card-foreground">{money(record.amount, record.currency)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
