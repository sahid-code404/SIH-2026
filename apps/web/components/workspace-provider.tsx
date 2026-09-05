"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/auth-provider";
import {
  buildNavigation,
  isPrivilegeRestricted,
  jurisdictionSummary,
  resolveWorkspace,
  type AuthorizationContext,
  type NavigationItem,
  type WorkspaceDefinition,
} from "@/lib/workspace-model";

type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

type WorkspaceContextValue = {
  status: WorkspaceStatus;
  authorization: AuthorizationContext | null;
  workspace: WorkspaceDefinition | null;
  navigation: NavigationItem[];
  jurisdictionLabel: string;
  privilegeRestricted: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user, request } = useAuth();
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [authorization, setAuthorization] = useState<AuthorizationContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (authStatus !== "authenticated") {
      setAuthorization(null);
      setError(null);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      const response = await request("/api/v1/authz/me", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setAuthorization((await response.json()) as AuthorizationContext);
      setError(null);
      setStatus("ready");
    } catch (reason) {
      setAuthorization(null);
      setError(reason instanceof Error ? reason.message : "Unable to resolve workspace authorization");
      setStatus("error");
    }
  }, [authStatus, request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload, user?.mfaEnabled]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const workspace = authorization ? resolveWorkspace(authorization) : null;
    return {
      status,
      authorization,
      workspace,
      navigation: authorization ? buildNavigation(authorization) : [],
      jurisdictionLabel: authorization ? jurisdictionSummary(authorization) : "",
      privilegeRestricted: authorization ? isPrivilegeRestricted(authorization) : false,
      error,
      reload,
    };
  }, [authorization, error, reload, status]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
