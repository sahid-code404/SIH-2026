import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./institutions.css";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "NirikshanX",
  description: "Trust, monitoring and inspection intelligence for SIH26095",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
