"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthorizationContextCard } from "@/components/authorization-context-card";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, InlineNotice, Input, StatusBadge } from "@/components/ui/primitives";

type Session = {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

type Enrollment = {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
};

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

function time(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AccountPage() {
  const router = useRouter();
  const { status, user, request, logout, logoutAll, refresh } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; title: string; message: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const response = await request("/api/v1/auth/sessions");
      if (!response.ok) throw new Error(await responseMessage(response));
      setSessions((await response.json()) as Session[]);
    } catch (reason) {
      setNotice({ tone: "danger", title: "Sessions unavailable", message: reason instanceof Error ? reason.message : "Unable to load sessions" });
    } finally {
      setLoadingSessions(false);
    }
  }, [request]);

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated") return;
    const timer = window.setTimeout(() => void loadSessions(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions, router, status]);

  async function revokeSession(sessionId: string, current: boolean) {
    const response = await request(`/api/v1/auth/sessions/${sessionId}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice({ tone: "danger", title: "Unable to revoke session", message: await responseMessage(response) });
      return;
    }
    if (current) {
      await refresh();
      router.replace("/login");
      return;
    }
    setNotice({ tone: "success", title: "Session revoked", message: "That session can no longer use its access or refresh credentials." });
    await loadSessions();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordBusy(true);
    setNotice(null);
    try {
      const response = await request("/api/v1/auth/password/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setCurrentPassword("");
      setNewPassword("");
      setNotice({ tone: "success", title: "Password changed", message: "Other active sessions were revoked immediately." });
      await loadSessions();
    } catch (reason) {
      setNotice({ tone: "danger", title: "Password not changed", message: reason instanceof Error ? reason.message : "Unable to change password" });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function beginMfaEnrollment() {
    setMfaBusy(true);
    setNotice(null);
    try {
      const response = await request("/api/v1/auth/mfa/totp/enroll", { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setEnrollment((await response.json()) as Enrollment);
      setTotpCode("");
    } catch (reason) {
      setNotice({ tone: "danger", title: "MFA enrollment unavailable", message: reason instanceof Error ? reason.message : "Unable to start enrollment" });
    } finally {
      setMfaBusy(false);
    }
  }

  async function confirmMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMfaBusy(true);
    setNotice(null);
    try {
      const response = await request("/api/v1/auth/mfa/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setEnrollment(null);
      setTotpCode("");
      await refresh();
      setNotice({
        tone: "success",
        title: "Authenticator enabled",
        message: "Future sign-ins require a fresh TOTP code. Sign out and sign in again before using permissions that require MFA assurance.",
      });
    } catch (reason) {
      setNotice({ tone: "danger", title: "MFA not enabled", message: reason instanceof Error ? reason.message : "Unable to confirm the code" });
    } finally {
      setMfaBusy(false);
    }
  }

  if (status === "loading" || !user) {
    return <main className="nx-account-page"><p className="nx-auth-loading">Restoring secure session…</p></main>;
  }

  return (
    <main className="nx-account-page" id="main-content">
      <header className="nx-account-header">
        <Link className="nx-auth-brand" href="/">
          <span className="nx-brand-mark" aria-hidden="true">NX</span>
          <span><strong>NirikshanX</strong><small>Account security</small></span>
        </Link>
        <div className="nx-account-actions">
          <Button variant="ghost" onClick={() => void logout().then(() => router.replace("/login"))}>Sign out</Button>
          <Button variant="danger" onClick={() => void logoutAll().then(() => router.replace("/login"))}>Sign out everywhere</Button>
        </div>
      </header>

      <section className="nx-account-hero">
        <div>
          <span className="nx-page-meta">Phase 5 · Authorization</span>
          <h1>{user.displayName}</h1>
          <p>{user.email}</p>
        </div>
        <StatusBadge tone={user.mfaEnabled ? "success" : "warning"}>{user.mfaEnabled ? "MFA enabled" : "MFA not enabled"}</StatusBadge>
      </section>

      {notice ? <InlineNotice tone={notice.tone} title={notice.title}>{notice.message}</InlineNotice> : null}

      <div className="nx-account-grid">
        <AuthorizationContextCard />

        <Card className="nx-account-card" as="section">
          <div className="nx-account-card-heading">
            <div><h2>Active sessions</h2><p>Server-backed sessions become invalid immediately when revoked.</p></div>
            <Button variant="secondary" size="sm" onClick={() => void loadSessions()} disabled={loadingSessions}>{loadingSessions ? "Refreshing…" : "Refresh"}</Button>
          </div>
          <div className="nx-session-list">
            {sessions.map((session) => (
              <article className="nx-session-row" key={session.id}>
                <div>
                  <div className="nx-session-title">
                    <strong>{session.current ? "This device" : "Signed-in device"}</strong>
                    {session.current ? <StatusBadge tone="info">Current</StatusBadge> : null}
                  </div>
                  <p>{session.userAgent || "Unknown client"}</p>
                  <small>Last active {time(session.lastSeenAt)} · Expires {time(session.expiresAt)}</small>
                </div>
                <Button variant={session.current ? "danger" : "secondary"} size="sm" onClick={() => void revokeSession(session.id, session.current)}>
                  {session.current ? "Revoke this session" : "Revoke"}
                </Button>
              </article>
            ))}
            {!loadingSessions && sessions.length === 0 ? <p>No active sessions are available.</p> : null}
          </div>
        </Card>

        <Card className="nx-account-card" as="section">
          <div className="nx-account-card-heading">
            <div><h2>Authenticator app</h2><p>TOTP adds a second factor without storing a reusable one-time code.</p></div>
            <StatusBadge tone={user.mfaEnabled ? "success" : "neutral"}>{user.mfaEnabled ? "Enabled" : "Not enabled"}</StatusBadge>
          </div>

          {user.mfaEnabled ? (
            <InlineNotice tone="success" title="Two-step sign-in is active">A fresh six-digit authenticator code is required after your password on future sign-ins.</InlineNotice>
          ) : enrollment ? (
            <form className="nx-auth-form" onSubmit={confirmMfa}>
              <div className="nx-mfa-secret">
                <span>Setup key</span>
                <code>{enrollment.secret}</code>
                <a href={enrollment.otpauthUri}>Open in authenticator app</a>
                <small>Enrollment expires {time(enrollment.expiresAt)}.</small>
              </div>
              <Field label="Verification code" htmlFor="confirm-totp" hint="Enter the current six-digit code to prove setup succeeded.">
                <Input id="confirm-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
              </Field>
              <Button type="submit" disabled={mfaBusy || totpCode.length !== 6}>{mfaBusy ? "Confirming…" : "Enable authenticator"}</Button>
            </form>
          ) : (
            <Button onClick={() => void beginMfaEnrollment()} disabled={mfaBusy}>{mfaBusy ? "Preparing…" : "Set up authenticator"}</Button>
          )}
        </Card>

        <Card className="nx-account-card" as="section">
          <div className="nx-account-card-heading">
            <div><h2>Change password</h2><p>Minimum 12 characters. Common passwords and your email identifier are rejected.</p></div>
          </div>
          <form className="nx-auth-form" onSubmit={changePassword}>
            <Field label="Current password" htmlFor="current-password"><Input id="current-password" type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></Field>
            <Field label="New password" htmlFor="new-password"><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></Field>
            <Button type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Change password"}</Button>
          </form>
        </Card>

        <Card className="nx-account-card" as="section">
          <div className="nx-account-card-heading"><div><h2>Identity details</h2><p>Authentication identity remains separate from the current authorization context shown above.</p></div></div>
          <dl className="nx-identity-list">
            <div><dt>User ID</dt><dd><code>{user.id}</code></dd></div>
            <div><dt>Language</dt><dd>{user.preferredLanguage}</dd></div>
            <div><dt>Last login</dt><dd>{time(user.lastLoginAt)}</dd></div>
          </dl>
        </Card>
      </div>
    </main>
  );
}
