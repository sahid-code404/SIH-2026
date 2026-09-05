"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type UserView = {
  id: string;
  email: string;
  displayName: string;
  preferredLanguage: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
};

type LoginResponse = {
  status: "AUTHENTICATED" | "MFA_REQUIRED";
  accessToken: string | null;
  expiresInSeconds: number | null;
  user: UserView | null;
  mfaChallengeToken: string | null;
  mfaChallengeExpiresInSeconds: number | null;
};

type AuthStatus = "loading" | "anonymous" | "authenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: UserView | null;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; challengeToken?: string }>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  refresh: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserView | null>(null);
  const tokenRef = useRef<string | null>(null);

  const acceptAuthenticated = useCallback((body: LoginResponse) => {
    if (body.status !== "AUTHENTICATED" || !body.accessToken || !body.user) {
      throw new Error("Authentication response was incomplete");
    }
    tokenRef.current = body.accessToken;
    setUser(body.user);
    setStatus("authenticated");
  }, []);

  const clearAuth = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/backend-api/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      clearAuth();
      return false;
    }
    acceptAuthenticated((await response.json()) as LoginResponse);
    return true;
  }, [acceptAuthenticated, clearAuth]);

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch(() => {
        if (!cancelled) clearAuth();
      })
      .finally(() => {
        if (!cancelled) setStatus((current) => (current === "loading" ? "anonymous" : current));
      });
    return () => {
      cancelled = true;
    };
  }, [clearAuth, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/backend-api/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      const body = (await response.json()) as LoginResponse;
      if (body.status === "MFA_REQUIRED") {
        if (!body.mfaChallengeToken) throw new Error("MFA challenge was not returned");
        return { mfaRequired: true, challengeToken: body.mfaChallengeToken };
      }
      acceptAuthenticated(body);
      return { mfaRequired: false };
    },
    [acceptAuthenticated],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const response = await fetch("/backend-api/api/v1/auth/mfa/login/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      acceptAuthenticated((await response.json()) as LoginResponse);
    },
    [acceptAuthenticated],
  );

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!tokenRef.current) {
        const refreshed = await refresh();
        if (!refreshed) throw new Error("Authentication is required");
      }

      const execute = () => {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");
        headers.set("Authorization", `Bearer ${tokenRef.current}`);
        return fetch(`/backend-api${path}`, { ...init, headers, credentials: "include" });
      };

      let response = await execute();
      if (response.status === 401 && (await refresh())) response = await execute();
      return response;
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) {
        await request("/api/v1/auth/logout", { method: "POST" });
      }
    } finally {
      clearAuth();
    }
  }, [clearAuth, request]);

  const logoutAll = useCallback(async () => {
    try {
      if (tokenRef.current) {
        await request("/api/v1/auth/logout-all", { method: "POST" });
      }
    } finally {
      clearAuth();
    }
  }, [clearAuth, request]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, verifyMfa, logout, logoutAll, request, refresh }),
    [status, user, login, verifyMfa, logout, logoutAll, request, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export type { UserView };
