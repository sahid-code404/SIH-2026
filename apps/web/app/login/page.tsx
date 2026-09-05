"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button, Field, InlineNotice, Input } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const { status, login, verifyMfa } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/account");
  }, [router, status]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        setCode("");
      } else {
        router.replace("/account");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfa(challengeToken, code);
      router.replace("/account");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nx-auth-page" id="main-content">
      <section className="nx-auth-card" aria-labelledby="login-title">
        <Link className="nx-auth-brand" href="/" aria-label="NirikshanX home">
          <span className="nx-brand-mark" aria-hidden="true">NX</span>
          <span>
            <strong>NirikshanX</strong>
            <small>Trust & verification</small>
          </span>
        </Link>

        <div className="nx-auth-heading">
          <span className="nx-page-meta">Unified secure access</span>
          <h1 id="login-title">{challengeToken ? "Verify your identity" : "Sign in to NirikshanX"}</h1>
          <p>
            {challengeToken
              ? "Enter the six-digit code from your authenticator app."
              : "One account provides access to the workspace your later authorization policy permits."}
          </p>
        </div>

        {error ? <InlineNotice tone="danger" title="Sign-in failed">{error}</InlineNotice> : null}

        {challengeToken ? (
          <form className="nx-auth-form" onSubmit={submitMfa}>
            <Field label="Authenticator code" htmlFor="totp-code" hint="Six digits. Each code can be used only once for login.">
              <Input
                id="totp-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
              />
            </Field>
            <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
              {busy ? "Verifying…" : "Verify and continue"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setChallengeToken(null);
                setCode("");
                setError(null);
              }}
            >
              Use a different account
            </Button>
          </form>
        ) : (
          <form className="nx-auth-form" onSubmit={submitPassword}>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" size="lg" disabled={busy || status === "loading"}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        <div className="nx-auth-security-note">
          <strong>Session security</strong>
          <p>Access credentials are short-lived. Refresh credentials stay in an HttpOnly cookie and are rotated by the server.</p>
        </div>
      </section>
    </main>
  );
}
