"use client";

import { useEffect, useState } from "react";

type ComponentState = {
  status: "UP" | "DOWN";
};

type SystemStatus = {
  service: string;
  status: "UP" | "DEGRADED";
  components: {
    database: ComponentState;
    redis: ComponentState;
  };
};

export default function Home() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/backend-api/api/v1/system/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return (await response.json()) as SystemStatus;
      })
      .then(setStatus)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Backend unavailable");
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-10">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-sm font-semibold tracking-[0.16em] text-[var(--primary)]">SIH26095</span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">NirikshanX foundation</h1>
          <p className="max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            Unified monitoring and trusted inspection platform. This screen intentionally shows only
            implemented infrastructure state; no fake risk, inspection or AI data is rendered.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">
          <StatusCard label="Backend" value={status?.status ?? (error ? "DOWN" : "CHECKING")} />
          <StatusCard label="PostgreSQL + PostGIS" value={status?.components.database.status ?? "CHECKING"} />
          <StatusCard label="Redis" value={status?.components.redis.status ?? "CHECKING"} />
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            Health check failed: {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] p-4">
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </article>
  );
}
