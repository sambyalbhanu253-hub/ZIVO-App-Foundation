import { ArrowLeft, Bell, CheckCheck, Heart, LoaderCircle, MessageCircle, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { loadNotifications, updateNotification } from "../lib/notifications";
import { loadSafetyRelationships } from "../lib/safety";
import type { ZivoNotification, ZivoNotificationKind } from "../lib/notifications";
import usePageMeta from "../hooks/usePageMeta";
import { cn } from "../lib/utils";

type NotificationStyle = { label: string; icon: typeof Bell; className: string };

const notificationStyles: Record<ZivoNotificationKind, NotificationStyle> = {
  follow: { label: "New follower", icon: UserPlus, className: "bg-primary text-primary-foreground" },
  like: { label: "Like", icon: Heart, className: "bg-accent text-primary" },
  comment: { label: "Comment", icon: MessageCircle, className: "bg-muted text-card-foreground" },
};

function relativeTime(timestamp: number) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return "now";
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h`;
  if (elapsedSeconds < 172800) return "Yesterday";
  return `${Math.floor(elapsedSeconds / 86400)}d`;
}

export default function NotificationsPage() {
  const { user, loading: isAuthLoading } = useAuth();
  const [notifications, setNotifications] = useState<ZivoNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  usePageMeta("Notifications on ZIVO", "Review new follower, likes, and comment notifications on ZIVO.");

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError("");
    try {
      const [loadedNotifications, relationships] = await Promise.all([loadNotifications(user.id), loadSafetyRelationships(user.id)]);
      const hiddenActorIds = new Set([...relationships.blockedUserIds, ...relationships.mutedUserIds]);
      setNotifications(loadedNotifications.filter((notification) => !hiddenActorIds.has(notification.actor.id)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      setNotifications([]);
      setError("");
      setIsLoading(false);
      return;
    }
    void refreshNotifications();
  }, [isAuthLoading, refreshNotifications, user]);

  const returnToPreviousScreen = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  const persistReadState = async (nextNotifications: ZivoNotification[], successMessage: string) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const changed = nextNotifications.filter(
        (notification) => !notifications.find((current) => current.id === notification.id)?.read && notification.read,
      );
      await Promise.all(changed.map((notification) => updateNotification(notification)));
      setNotifications(nextNotifications);
      setStatus(successMessage);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update notifications.");
    } finally {
      setIsSaving(false);
    }
  };

  const markAllAsRead = () => {
    if (unreadCount === 0) {
      setStatus("All notifications are already read.");
      return;
    }
    const nextNotifications = notifications.map((notification) => ({ ...notification, read: true }));
    void persistReadState(nextNotifications, `${unreadCount} notifications marked as read.`);
  };

  const openNotification = (id: string) => {
    const notification = notifications.find((item) => item.id === id);
    if (!notification || notification.read) return;
    const nextNotifications = notifications.map((item) => (item.id === id ? { ...item, read: true } : item));
    void persistReadState(
      nextNotifications,
      `${notificationStyles[notification.kind].label} notification marked as read.`,
    );
  };

  return (
    <section className="zivo-screen -mx-5 -mt-6 pb-2" aria-labelledby="notifications-heading">
      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={returnToPreviousScreen}
              className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              aria-label="Back to previous screen"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">Your activity</p>
              <h1
                id="notifications-heading"
                className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground"
              >
                Notifications
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep up with activity on your ZIVO account.
              </p>
            </div>
          </div>
          {user && (
            <span className="mt-1 inline-flex min-h-8 items-center rounded-full border border-border bg-card px-2.5 text-xs font-extrabold text-card-foreground">
              {unreadCount} new
            </span>
          )}
        </div>

        {isAuthLoading ? (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm font-semibold text-muted-foreground">
            <LoaderCircle size={18} className="zivo-loader text-primary" aria-hidden="true" /> Checking your account…
          </div>
        ) : !user ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center shadow-premium">
            <Bell size={24} className="mx-auto text-primary" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-extrabold text-card-foreground">Your activity, in one place</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in to load notifications saved for your ZIVO account.
            </p>
            <Link
              to="/sign-in"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-premium">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary">
                  <Bell size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-card-foreground">Activity updates</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {isLoading
                      ? "Loading updates…"
                      : unreadCount > 0
                        ? `${unreadCount} unread updates`
                        : "You are all caught up"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={markAllAsRead}
                disabled={unreadCount === 0 || isSaving || isLoading}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-extrabold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
              >
                <CheckCheck size={16} aria-hidden="true" />
                {isSaving ? "Saving…" : "Mark all read"}
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-primary/45 bg-accent p-4" role="alert">
                <p className="text-sm font-semibold text-card-foreground">{error}</p>
                <button
                  type="button"
                  onClick={() => void refreshNotifications()}
                  disabled={isLoading || isSaving}
                  className="mt-3 min-h-9 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Try again
                </button>
              </div>
            )}

            {!error && isLoading ? (
              <div className="mt-6 flex justify-center py-10">
                <LoaderCircle size={22} className="zivo-loader text-primary" aria-label="Loading notifications" />
              </div>
            ) : !error && notifications.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center shadow-premium">
                <Bell size={23} className="mx-auto text-primary" aria-hidden="true" />
                <h2 className="mt-3 text-base font-extrabold text-card-foreground">Nothing new just yet</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  When someone follows you, likes a post, or comments, it will appear here.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h2 className="text-sm font-extrabold text-foreground">Recent</h2>
                <div className="mt-3 space-y-2" aria-label="Recent notifications">
                  {notifications.map((notification) => {
                    const details = notificationStyles[notification.kind];
                    const Icon = details.icon;
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => openNotification(notification.id)}
                        disabled={isSaving}
                        aria-label={`${details.label} from ${notification.actor.name}, ${notification.read ? "read" : "unread"}`}
                        className={cn(
                          "relative flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] disabled:cursor-not-allowed",
                          notification.read ? "border-border bg-card" : "border-primary/35 bg-accent/60 shadow-premium",
                        )}
                      >
                        <div className="relative shrink-0">
                          <img
                            data-genmb-img={`${notification.actor.name} notification avatar`}
                            src={
                              notification.actor.avatar ||
                              `https://picsum.photos/seed/zivo-notification-${notification.id}/96/96`
                            }
                            alt={`${notification.actor.name} profile placeholder`}
                            className="size-12 rounded-full border border-border object-cover"
                            onError={(event) => {
                              event.currentTarget.src = `https://picsum.photos/seed/zivo-notification-${notification.id}-fallback/96/96`;
                            }}
                          />
                          <span
                            className={cn(
                              "absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-card",
                              details.className,
                            )}
                          >
                            <Icon size={11} aria-hidden="true" />
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-5 text-card-foreground">
                            <span className="font-extrabold">{notification.actor.name}</span>{" "}
                            <span className={notification.read ? "font-medium text-muted-foreground" : "font-semibold"}>
                              {notification.message}
                            </span>
                          </p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            {notification.actor.handle} · {relativeTime(notification.createdAt)}
                          </p>
                        </div>
                        {notification.contentPreview ? (
                          <img
                            data-genmb-img={`${notification.actor.name} content notification preview`}
                            src={notification.contentPreview}
                            alt="Related post preview"
                            className="size-12 shrink-0 rounded-xl border border-border object-cover"
                            onError={(event) => {
                              event.currentTarget.src = `https://picsum.photos/seed/zivo-notification-${notification.id}-preview-fallback/96/96`;
                            }}
                          />
                        ) : (
                          <span className="w-2 shrink-0" aria-hidden="true" />
                        )}
                        {!notification.read && (
                          <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" aria-label="Unread" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  );
}
