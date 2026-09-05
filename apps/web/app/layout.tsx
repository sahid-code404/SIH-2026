import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./institutions.css";
import "./programs.css";
import "./institution-programs.css";
import "./workspace.css";
import { AuthProvider } from "@/components/auth-provider";
import { RoleAwareShell } from "@/components/role-aware-shell";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { WorkspaceProvider } from "@/components/workspace-provider";

export const metadata: Metadata = {
  title: "NirikshanX",
  description: "Trust, monitoring and inspection intelligence for SIH26095",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <AuthProvider>
          <WorkspaceProvider>
            <RoleAwareShell>{children}</RoleAwareShell>
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
