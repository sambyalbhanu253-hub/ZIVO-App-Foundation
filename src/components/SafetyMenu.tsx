import { Ban, Flag, MoreHorizontal, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  createSafetyReport,
  setSafetyRelationship,
  type ZivoReportReason,
  type ZivoReportTargetType,
} from "../lib/safety";

type SafetyMenuProps = {
  targetType: ZivoReportTargetType;
  targetId: string;
  targetOwnerId: string;
  targetName: string;
  onSafetyChange?: () => void;
  className?: string;
};

const reasons: ZivoReportReason[] = ["Spam", "Harassment", "Inappropriate content", "Misleading/Fake", "Other"];

export default function SafetyMenu({
  targetType,
  targetId,
  targetOwnerId,
  targetName,
  onSafetyChange,
  className,
}: SafetyMenuProps) {
  const { user, loading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [dialog, setDialog] = useState<"report" | "block" | "mute" | null>(null);
  const [reason, setReason] = useState<ZivoReportReason>("Spam");
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const ownTarget = Boolean(user && user.id === targetOwnerId);

  const closeDialog = () => {
    if (isSaving) return;
    setDialog(null);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"),
      );
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? index <= 0
          ? controls.length - 1
          : index - 1
        : index === controls.length - 1
          ? 0
          : index + 1;
      event.preventDefault();
      controls[nextIndex].focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, isSaving]);

  if (ownTarget) return null;

  const requireUser = () => {
    if (isAuthLoading) {
      setStatus("Checking your account…");
      return false;
    }
    if (!user) {
      navigate("/sign-in");
      return false;
    }
    return true;
  };

  const openAction = (action: "report" | "block" | "mute") => {
    setIsOpen(false);
    setStatus("");
    if (!requireUser()) return;
    setDialog(action);
  };

  const submitReport = async () => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setStatus("");
    try {
      const result = await createSafetyReport({ reporterId: user.id, targetType, targetId, targetOwnerId, reason });
      setStatus(
        result.duplicate
          ? "You already reported this item. It remains pending review."
          : "Report submitted for future moderation review.",
      );
      setDialog(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to submit this report.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRelationship = async (type: "block" | "mute") => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setStatus("");
    try {
      const result = await setSafetyRelationship(user.id, targetOwnerId, type);
      setStatus(
        result.changed
          ? `${type === "block" ? "Blocked" : "Muted"} ${targetName}. Their content will no longer appear in your normal feed.`
          : `${targetName} is already ${type === "block" ? "blocked" : "muted"}.`,
      );
      setDialog(null);
      onSafetyChange?.();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Unable to ${type} this user.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className={`relative ${className ?? ""}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label={`More options for ${targetName}`}
          aria-expanded={isOpen}
          className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
        {isOpen && (
          <div
            role="menu"
            className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-border bg-card p-1.5 shadow-float"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => openAction("report")}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-bold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Flag size={15} className="text-primary" aria-hidden="true" /> Report
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openAction("mute")}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-bold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <VolumeX size={15} className="text-primary" aria-hidden="true" /> Mute user
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => openAction("block")}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-bold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Ban size={15} className="text-primary" aria-hidden="true" /> Block user
            </button>
          </div>
        )}
      </div>
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-float"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Safety</p>
                <h2 id="safety-dialog-title" className="mt-1 text-lg font-extrabold text-card-foreground">
                  {dialog === "report"
                    ? `Report ${targetName}?`
                    : `${dialog === "block" ? "Block" : "Mute"} ${targetName}?`}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSaving}
                aria-label="Close safety dialog"
                className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {dialog === "report" ? (
              <>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Choose the reason that best describes your concern. Reports are saved with a pending status for future
                  owner review.
                </p>
                <fieldset className="mt-4 space-y-2">
                  <legend className="sr-only">Report reason</legend>
                  {reasons.map((item) => (
                    <label
                      key={item}
                      className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-card-foreground"
                    >
                      <input
                        type="radio"
                        name={`report-${targetType}-${targetId}`}
                        checked={reason === item}
                        onChange={() => setReason(item)}
                        disabled={isSaving}
                        className="accent-primary"
                      />
                      {item}
                    </label>
                  ))}
                </fieldset>
                <button
                  type="button"
                  onClick={() => void submitReport()}
                  disabled={isSaving}
                  className="mt-5 min-h-11 w-full rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {isSaving ? "Submitting…" : "Submit report"}
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {dialog === "block"
                    ? "Blocking removes this user’s content from your normal feeds and prevents normal interactions between you."
                    : "Muting removes this user’s content from your normal feeds and stops their activity from appearing in your notifications."}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSaving}
                    className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmRelationship(dialog)}
                    disabled={isSaving}
                    className="min-h-11 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {isSaving ? "Saving…" : dialog === "block" ? "Block user" : "Mute user"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {status && (
        <p className="sr-only" role="status">
          {status}
        </p>
      )}
    </>
  );
}
