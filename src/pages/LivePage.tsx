import { ArrowLeft, Heart, Radio, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ZivoInlineLoader } from "../components/ZivoState";
import usePageMeta from "../hooks/usePageMeta";
import {
  endLiveSession,
  loadLiveChat,
  loadLiveSession,
  recordLiveReaction,
  sendLiveChatMessage,
  type ZivoLiveChatMessage,
  type ZivoLiveSession,
} from "../lib/live";

export default function LivePage() {
  const { liveSessionId = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [live, setLive] = useState<ZivoLiveSession | null>(null);
  const [messages, setMessages] = useState<ZivoLiveChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  usePageMeta("ZIVO Live", "Watch and chat with live ZIVO creators.");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [session, chat] = await Promise.all([loadLiveSession(liveSessionId), loadLiveChat(liveSessionId)]);
        if (!active) return;
        setLive(session);
        setMessages(chat);
        setError(session ? "" : "This Live session is unavailable.");
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load this Live.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const unsubscribe = window.genmb.realtime.subscribe(`zivo-live:${liveSessionId}`, () => void load());
    const interval = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [liveSessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sendChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      navigate("/sign-in", { state: { from: `/live/${liveSessionId}` } });
      return;
    }
    if (sending || !message.trim()) return;
    setSending(true);
    setError("");
    try {
      const saved = await sendLiveChatMessage({ user, liveSessionId, message });
      setMessages((current) => [...current, saved]);
      setMessage("");
      try {
        await window.genmb.realtime.publish(`zivo-live:${liveSessionId}`, {
          type: "chat",
          liveSessionId,
          messageId: saved.id,
        });
        setStatus("Message sent.");
      } catch (realtimeError) {
        setStatus(
          `Message saved. Other viewers will refresh shortly: ${realtimeError instanceof Error ? realtimeError.message : "realtime delivery failed."}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send your message.");
    } finally {
      setSending(false);
    }
  };

  const react = async (reaction: "heart" | "fire" | "clap") => {
    if (!user) {
      navigate("/sign-in", { state: { from: `/live/${liveSessionId}` } });
      return;
    }
    try {
      const event = await recordLiveReaction({ user, liveSessionId, reaction });
      try {
        await window.genmb.realtime.publish(`zivo-live:${liveSessionId}`, {
          type: "reaction",
          liveSessionId,
          reactionId: event.id,
        });
        setStatus(`${reaction === "heart" ? "Heart" : reaction === "fire" ? "Fire" : "Clap"} sent.`);
      } catch (realtimeError) {
        setStatus(
          `Reaction saved. Realtime delivery failed: ${realtimeError instanceof Error ? realtimeError.message : "unknown error."}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send reaction.");
    }
  };

  const endLive = async () => {
    if (!user || !live || ending) return;
    setEnding(true);
    setError("");
    try {
      const ended = await endLiveSession({ user, liveSessionId: live.liveSessionId });
      setLive(ended);
      try {
        await window.genmb.realtime.publish(`zivo-live:${liveSessionId}`, { type: "ended", liveSessionId });
        setStatus("Live ended. The session record is preserved for future replay processing.");
      } catch (realtimeError) {
        setStatus(
          `Live ended and was saved. Realtime delivery failed: ${realtimeError instanceof Error ? realtimeError.message : "unknown error."}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to end this Live.");
    } finally {
      setEnding(false);
    }
  };

  if (loading || authLoading)
    return (
      <section className="zivo-screen flex min-h-72 items-center justify-center">
        <ZivoInlineLoader label="Loading Live…" />
      </section>
    );
  if (!live)
    return (
      <section className="zivo-screen space-y-4">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-extrabold text-card-foreground"
        >
          <ArrowLeft size={18} /> Back home
        </Link>
        <p
          role="alert"
          className="rounded-2xl border border-primary/45 bg-accent p-4 text-sm font-semibold text-card-foreground"
        >
          {error || "This Live session is unavailable."}
        </p>
      </section>
    );
  const isOwner = user?.id === live.creatorId;
  const isLive = live.status === "live";
  return (
    <section className="zivo-screen -mx-5 -mt-5 pb-2" aria-labelledby="live-title">
      <div className="relative aspect-[9/13] overflow-hidden bg-card">
        {isLive && live.streamSource.playbackUrl ? (
          <video
            src={live.streamSource.playbackUrl}
            controls
            playsInline
            className="size-full object-cover"
            aria-label={`$"DEBUG TITLE WORKING" live stream`}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center bg-gradient-to-b from-accent to-background px-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-card text-primary shadow-premium">
              <Radio size={30} />
            </span>
            <h1 id="live-title" className="mt-5 text-xl font-extrabold text-card-foreground">
              {isLive ? "Live stream source is not connected" : "This Live has ended"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isLive
                ? "ZIVO saved this Live session and chat. A supported broadcasting provider must supply a secure playback URL before viewers can watch."
                : "No replay is available because no recording was created for this session."}
            </p>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-background/75 to-transparent p-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Leave live session"
            className="flex size-11 items-center justify-center rounded-full bg-card/70 text-card-foreground backdrop-blur"
          >
            <ArrowLeft size={20} />
          </button>
          <span
            className={
              isLive
                ? "rounded-full bg-primary px-3 py-1.5 text-[10px] font-extrabold tracking-[0.16em] text-primary-foreground"
                : "rounded-full bg-muted px-3 py-1.5 text-[10px] font-extrabold tracking-[0.16em] text-card-foreground"
            }
          >
            {isLive ? "LIVE" : "ENDED"}
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-md space-y-4 px-5 pt-5">
        <div className="flex items-center gap-3">
          <img
            data-genmb-img={`${live.creatorProfile.displayName} profile`}
            src={live.creatorProfile.avatarUrl}
            alt=""
            className="size-11 rounded-full border border-border object-cover"
          />
          <div className="min-w-0 flex-1">
            <Link
              to={`/profile/${encodeURIComponent(live.creatorId)}`}
              className="block truncate text-sm font-extrabold text-foreground"
            >
              {live.creatorProfile.displayName}
            </Link>
            <p className="text-xs font-semibold text-muted-foreground">
              {live.creatorProfile.username}
              {live.category ? ` · ${live.category}` : ""}
            </p>
          </div>
          {isOwner && isLive && (
            <button
              type="button"
              disabled={ending}
              onClick={() => void endLive()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/60 px-3 text-xs font-extrabold text-primary disabled:opacity-60"
            >
              <Square size={15} fill="currentColor" />
              {ending ? "Ending…" : "End Live"}
            </button>
          )}
        </div>
        <h2 className="text-lg font-extrabold text-foreground">"DEBUG TITLE WORKING"</h2>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-primary/45 bg-accent px-3 py-2 text-xs font-semibold text-card-foreground"
          >
            {error}
          </p>
        )}
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
        <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="live-chat-title">
          <div className="flex items-center justify-between">
            <h2 id="live-chat-title" className="text-sm font-extrabold text-card-foreground">
              Live chat
            </h2>
            <span className="text-xs font-semibold text-muted-foreground">
              {isLive ? "Connected chat" : "Chat closed"}
            </span>
          </div>
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
            {messages.length ? (
              messages.map((item) => (
                <div key={item.id} className="text-sm">
                  <span className="font-extrabold text-card-foreground">{item.senderProfile.displayName}</span>
                  <span className="ml-2 text-muted-foreground">{item.message}</span>
                </div>
              ))
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                No messages yet. Be the first to say hello when this Live is active.
              </p>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendChat} className="mt-4 flex gap-2">
            <label htmlFor="live-message" className="sr-only">
              Send a live chat message
            </label>
            <input
              id="live-message"
              value={message}
              disabled={!isLive || sending}
              maxLength={280}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={isLive ? "Say something…" : "Chat is closed"}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isLive || sending || !message.trim()}
              className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
              aria-label="Send live chat message"
            >
              <Send size={18} />
            </button>
          </form>
        </section>
        {isLive && (
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => void react("heart")}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-extrabold text-primary"
            >
              <Heart size={18} fill="currentColor" />
              React
            </button>
            <button
              type="button"
              onClick={() => void react("fire")}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-extrabold text-card-foreground"
              aria-label="Send fire reaction"
            >
              🔥
            </button>
            <button
              type="button"
              onClick={() => void react("clap")}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-extrabold text-card-foreground"
              aria-label="Send clap reaction"
            >
              👏
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
