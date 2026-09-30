import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Mail, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import usePageMeta from "../hooks/usePageMeta";
import { useAuth } from "../auth/AuthProvider";
import { ZivoInlineLoader, ZivoLoadingState } from "../components/ZivoState";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthMode = "sign-in" | "sign-up" | "forgot-password";

function getErrorMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "NETWORK_ERROR") return "Check your connection and try again.";
  if (code === "SIGN_IN_TIMEOUT") return "That took too long. Please try again.";
  if (code === "LOGIN_FAILED") return "Those details did not work. Check them and try again.";
  if (code === "SIGNUP_FAILED") return "We could not create that account. If you already registered, sign in instead.";
  if (code === "VERIFY_FAILED") return "That code is not valid. Check your email and try again.";
  return fallback;
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function storedUsername(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const username = (value as Record<string, unknown>).username;
  return typeof username === "string" ? normalizeUsername(username) : null;
}

async function isUsernameTaken(username: string) {
  const profiles = await window.genmb.kv.list("zivo:profile:");
  return profiles.data.some((record) => storedUsername(record.value) === username);
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, error: sessionError } = useAuth();
  const mode: AuthMode =
    location.pathname === "/sign-up"
      ? "sign-up"
      : location.pathname === "/forgot-password"
        ? "forgot-password"
        : "sign-in";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"form" | "verify" | "reset-confirm">("form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  usePageMeta(
    mode === "sign-up"
      ? "Create your ZIVO account"
      : mode === "forgot-password"
        ? "Reset your ZIVO password"
        : "Sign in to ZIVO",
    "Access your ZIVO account and keep exploring premium social video.",
  );

  useEffect(() => {
    if (!authLoading && user) navigate("/", { replace: true });
  }, [authLoading, navigate, user]);

  if (authLoading) {
    return (
      <main className="auth-frame">
        <div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-5">
          <ZivoLoadingState label="Opening your ZIVO account…" className="w-full" />
        </div>
      </main>
    );
  }

  if (user) {
    return <main className="auth-frame"><div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-5"><ZivoLoadingState label="Opening your ZIVO feed…" className="w-full" /></div></main>;
  }

  const validateEmail = () => {
    if (!emailPattern.test(email.trim())) {
      setError("Enter a valid email address.");
      return false;
    }
    return true;
  };

  const handleMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!validateEmail()) return;
    setSubmitting(true);
    try {
      await window.genmb.auth.sendMagicLink(email.trim());
      setMagicLinkSent(true);
      setSuccess(`If ${email.trim()} can receive mail, a sign-in link is on its way. Open it on this device to continue.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : getErrorMessage(nextError, "We could not send the sign-in link. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const signedInUser = await window.genmb.auth.signInWithPassword(email.trim(), password);
      if (!signedInUser) {
        setError("Sign-in was cancelled. Please try again.");
        return;
      }
      navigate("/", { replace: true });
    } catch (nextError) {
      setError(getErrorMessage(nextError, "We could not sign you in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const normalizedUsername = normalizeUsername(username);
    if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
      return setError("Use 3–30 letters, numbers, periods, hyphens, or underscores for your username.");
    }
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (!validateEmail()) return;
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setSubmitting(true);
    try {
      if (await isUsernameTaken(normalizedUsername)) {
        setError("That username is already in use. Please choose another one.");
        return;
      }
      const result = await window.genmb.auth.signUp(email.trim(), password, fullName.trim());
      if (!result.success) {
        setError("We could not create that account. If you already registered, sign in instead.");
        return;
      }
      setStep("verify");
      setSuccess(`We sent a 6-digit code to ${email.trim()}.`);
    } catch (nextError) {
      setError(getErrorMessage(nextError, "We could not create your account. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifySignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setSubmitting(true);
    try {
      const signedInUser = await window.genmb.auth.verifySignUp(email.trim(), code);
      if (!signedInUser) {
        setError("We could not verify that code. Please try again.");
        return;
      }

      await window.genmb.kv.set(`zivo:profile:${signedInUser.id}`, {
        username: `@${normalizeUsername(username)}`,
        displayName: fullName.trim(),
        email: signedInUser.email || email.trim(),
        bio: '',
        avatarUrl: signedInUser.picture || undefined,
      });

      navigate("/", { replace: true });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "";
      setError(message || getErrorMessage(nextError, "We could not verify that code. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!validateEmail()) return;
    setSubmitting(true);
    try {
      await window.genmb.auth.requestPasswordReset(email.trim());
      setStep("reset-confirm");
      setSuccess(`If an account uses ${email.trim()}, a 6-digit reset code is on its way.`);
    } catch (nextError) {
      setError(getErrorMessage(nextError, "We could not start your password reset. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    if (newPassword.length < 8) return setError("Use a new password with at least 8 characters.");
    setSubmitting(true);
    try {
      const result = await window.genmb.auth.confirmPasswordReset(email.trim(), code, newPassword);
      if (!result.success) {
        setError("We could not reset your password. Please request a new code and try again.");
        return;
      }
      navigate("/sign-in", { replace: true });
    } catch (nextError) {
      setError(getErrorMessage(nextError, "We could not reset your password. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const isVerification = mode === "sign-up" && step === "verify";
  const isResetConfirmation = mode === "forgot-password" && step === "reset-confirm";
  const heading = isVerification
    ? "Check your email"
    : isResetConfirmation
      ? "Choose a new password"
      : mode === "sign-up"
        ? "Create your account"
        : mode === "forgot-password"
          ? "Reset your password"
          : "Welcome back";

  return (
    <main className="auth-frame" aria-labelledby="auth-heading">
      <section className="mx-auto w-full max-w-md px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <Link
          to="/"
          className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to ZIVO"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-premium">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Watch culture</p>
            <p className="text-2xl font-extrabold tracking-[-0.1em] text-foreground">ZIVO</p>
          </div>
        </div>
        <div className="mt-8">
          <h1 id="auth-heading" className="text-3xl font-extrabold tracking-[-0.065em] text-foreground">
            {heading}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isVerification || isResetConfirmation
              ? "Enter the secure code we sent to finish this step."
              : mode === "sign-up"
                ? "Join the conversations and creators shaping what is next."
                : mode === "forgot-password"
                  ? "We will email a secure code to help you get back in."
                  : "Sign in to pick up where your feed left off."}
          </p>
        </div>

        {(error || success || sessionError) && (
          <div
            role={error || sessionError ? "alert" : "status"}
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${error || sessionError ? "border-primary/50 bg-accent text-card-foreground" : "border-primary/40 bg-card text-card-foreground"}`}
          >
            {error || sessionError || success}
            {sessionError && <button type="button" onClick={() => window.location.reload()} className="mt-3 block rounded-lg border border-border bg-card px-3 py-2 text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Reload ZIVO</button>}
          </div>
        )}

        {isVerification ? (
          <form className="mt-6 space-y-4" onSubmit={handleVerifySignUp}>
            <CodeInput code={code} setCode={setCode} />
            <SubmitButton busy={submitting} label="Verify and enter ZIVO" />
          </form>
        ) : isResetConfirmation ? (
          <form className="mt-6 space-y-4" onSubmit={handleResetConfirm}>
            <CodeInput code={code} setCode={setCode} />
            <PasswordInput
              id="new-password"
              label="New password"
              value={newPassword}
              setValue={setNewPassword}
              visible={showPassword}
              setVisible={setShowPassword}
            />
            <SubmitButton busy={submitting} label="Reset password" />
          </form>
        ) : mode === "sign-up" ? (
          <form className="mt-6 space-y-4" onSubmit={handleSignUp}>
            <TextInput
              id="username"
              label="Username"
              value={username}
              setValue={setUsername}
              autoComplete="username"
              placeholder="yourname"
            />
            <TextInput
              id="full-name"
              label="Full name"
              value={fullName}
              setValue={setFullName}
              autoComplete="name"
              placeholder="Your full name"
            />
            <TextInput
              id="signup-email"
              label="Email"
              value={email}
              setValue={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
            />
            <PasswordInput
              id="signup-password"
              label="Password"
              value={password}
              setValue={setPassword}
              visible={showPassword}
              setVisible={setShowPassword}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Your username is collected for your upcoming ZIVO profile setup.
            </p>
            <SubmitButton busy={submitting} label="Create account" />
          </form>
        ) : mode === "forgot-password" ? (
          <form className="mt-6 space-y-4" onSubmit={handleResetRequest}>
            <TextInput
              id="reset-email"
              label="Email"
              value={email}
              setValue={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
            />
            <SubmitButton busy={submitting} label="Email reset code" />
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
            <TextInput
              id="signin-email"
              label="Email"
              value={email}
              setValue={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
            />
            <PasswordInput
              id="signin-password"
              label="Password"
              value={password}
              setValue={setPassword}
              visible={showPassword}
              setVisible={setShowPassword}
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Forgot password?
              </Link>
            </div>
            <SubmitButton busy={submitting} label="Sign in" />
          </form>
        )}

        {mode === "sign-in" && (
          <div className="mt-6">
            <div className="mb-6 flex items-center gap-3 text-xs font-bold text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or sign in without a password
              <span className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={handleMagicLink} className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">We’ll email you a secure sign-in link. No popup or Google redirect needed.</p>
              <p className="text-xs text-muted-foreground">Uses the email entered above.</p>
              <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-extrabold text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <ZivoInlineLoader label="Sending link…" /> : <><Mail size={18} className="text-primary" aria-hidden="true" />{magicLinkSent ? "Send another sign-in link" : "Email me a sign-in link"}</>}
              </button>
            </form>
          </div>
        )}
        <p className="mt-8 text-center text-sm font-semibold text-muted-foreground">
          {mode === "sign-up"
            ? "Already have an account?"
            : mode === "sign-in"
              ? "New to ZIVO?"
              : "Remembered your password?"}{" "}
          <Link
            to={mode === "sign-up" ? "/sign-in" : "/sign-up"}
            className="font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mode === "sign-up" ? "Sign in" : mode === "sign-in" ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </section>
    </main>
  );
}

function TextInput({
  id,
  label,
  value,
  setValue,
  type = "text",
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
  type?: string;
  autoComplete: string;
  placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-card-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-sm font-semibold text-card-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
function PasswordInput({
  id,
  label,
  value,
  setValue,
  visible,
  setVisible,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
  visible: boolean;
  setVisible: (value: boolean) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-card-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete={
            id === "new-password" ? "new-password" : id === "signin-password" ? "current-password" : "new-password"
          }
          placeholder="••••••••"
          className="min-h-12 w-full rounded-xl border border-border bg-card px-3 pr-12 text-sm font-semibold text-card-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
function CodeInput({ code, setCode }: { code: string; setCode: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="verification-code" className="mb-1.5 block text-sm font-extrabold text-card-foreground">
        6-digit code
      </label>
      <div className="relative">
        <KeyRound
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary"
          size={18}
          aria-hidden="true"
        />
        <input
          id="verification-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="min-h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm font-extrabold tracking-[0.3em] text-card-foreground outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <>
          <ZivoInlineLoader label="Working…" />
        </>
      ) : (
        <>
          <CheckCircle2 size={18} aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  );
}
