import { Bell, LogOut, MessageCircle, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { loadNotifications } from "../lib/notifications";
import InstallZivoButton from "./InstallZivoButton";

export default function ZivoHeader() {
  const { user, loading } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [status, setStatus] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    const frame = header?.closest<HTMLElement>(".app-frame");
    if (!header || !frame) return;
    const updateHeight = () => frame.style.setProperty("--home-header-height", `${header.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      frame.style.removeProperty("--home-header-height");
    };
  }, []);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const notifications = await loadNotifications(user.id);
      setUnreadNotifications(notifications.filter((notification) => !notification.read).length);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to refresh notifications.");
    }
  }, [user]);

  useEffect(() => {
    void refreshUnreadNotifications();
    const unsubscribe = user ? window.genmb.realtime.subscribe(`zivo:notifications:${user.id}`, () => {
      void refreshUnreadNotifications();
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        void loadNotifications(user.id).then((items) => {
          const latest = items.find((item) => !item.read)
          if (latest) new Notification(`${latest.actor.name} on ZIVO`, {
            body: latest.message,
            icon: '/icons/zivo-icon-192.svg',
            tag: `zivo-${latest.id}`,
          }).onclick = () => { window.focus(); window.location.hash = '#/notifications' }
        }).catch((error) => setStatus(error instanceof Error ? error.message : 'Unable to show activity alert.'))
      }
    }) : undefined;
    const handleNotificationsChanged = (event: Event) => {
      const changedRecipientId = (event as CustomEvent<{ recipientId?: string }>).detail?.recipientId;
      if (!user || changedRecipientId === user.id) void refreshUnreadNotifications();
    };
    window.addEventListener('zivo:notifications-changed', handleNotificationsChanged);
    return () => {
      unsubscribe?.();
      window.removeEventListener('zivo:notifications-changed', handleNotificationsChanged);
    };
  }, [refreshUnreadNotifications, user]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setStatus("");
    try {
      await window.genmb.auth.signOut();
      setStatus("Signed out of ZIVO.");
      navigate("/sign-in", { replace: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not sign you out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header ref={headerRef} className="home-header sticky top-0 z-40 border-b border-border/65 bg-background/85 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-2xl zivo-elevated-surface">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <Link
          to="/"
          className="group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Go to ZIVO home"
        >
          <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-[0.9rem] bg-primary text-primary-foreground shadow-premium transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.98]">
            <span className="absolute -right-3 -top-3 size-8 rounded-full bg-card/35" aria-hidden="true" />
            <Sparkles className="relative" size={19} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span>
            <span className="home-header-tagline block text-[9px] font-extrabold uppercase tracking-[0.24em] text-primary">
              Watch culture
            </span>
            <span className="block -mt-0.5 text-[1.35rem] font-extrabold tracking-[-0.1em] text-foreground">ZIVO</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <InstallZivoButton />
          {!loading && !user && (
            <Link
              to="/sign-in"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-premium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
            >
              Sign in
            </Link>
          )}
          {!loading && user && (
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              aria-label="Sign out of ZIVO"
              className="home-header-action flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
          )}
          <Link
            to="/messages"
            className="home-header-action zivo-icon-button relative flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-card-foreground shadow-premium hover:-translate-y-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
            aria-label="Open messages"
          >
            <MessageCircle size={18} strokeWidth={2.2} aria-hidden="true" />
            <span
              className="absolute right-2 top-2 size-1.5 rounded-full bg-primary ring-2 ring-card"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/notifications"
            className="home-header-action zivo-icon-button relative flex size-10 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-card-foreground shadow-premium hover:-translate-y-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
            aria-label="Open notifications"
          >
            <Bell size={18} strokeWidth={2.2} aria-hidden="true" />
            {unreadNotifications > 0 && (
              <span
                className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-extrabold leading-4 text-primary-foreground"
                aria-label={`${unreadNotifications} unread notifications`}
              >
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </div>
      <p className="sr-only" role="status">
        {status}
      </p>
    </header>
  );
}
