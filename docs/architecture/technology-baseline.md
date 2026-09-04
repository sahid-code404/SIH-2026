# Technology Baseline

Validated during repository initialization on 2026-09-05.

| Area | Baseline |
|---|---|
| Java | 25 LTS |
| Spring Boot | 4.1.1 |
| Node.js | 24.20.0 LTS |
| Next.js | 16.3.3 Active LTS |
| PostgreSQL | 18.6 |
| PostGIS | 3.6.4 stable |
| Redis OSS | 8.8.2 |

## Web

Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui, Radix where useful, TanStack Query, React Hook Form, Zod, Motion, MapLibre GL JS, IndexedDB, Service Worker and a PWA manifest.

## Backend

Java 25 LTS, Spring Boot 4.1.x, Gradle Kotlin DSL, Spring Security, Spring Data JPA/Hibernate, Flyway, PostgreSQL driver, Redis integration, Actuator, Micrometer and OpenTelemetry.

The backend begins as a modular monolith.

## Data

PostgreSQL + PostGIS is authoritative. Use UUID identifiers, UTC timestamps, strong foreign keys, database constraints, optimistic locking on important mutable aggregates, and spatial indexes for institution locations.

Redis is non-authoritative infrastructure for caching and bounded ephemeral coordination.

## Object storage

Use a private S3-compatible storage abstraction. MinIO-compatible local development remains the target. The exact local image will be pinned after a reproducibility and licensing check.

## Version policy

- Pin direct dependencies in Gradle/package lockfiles.
- Pin container images to explicit versions.
- Prefer stable/LTS releases over beta, RC or milestone builds.
- Upgrade security releases promptly after tests pass.

## Official references

- https://www.oracle.com/java/technologies/downloads/
- https://spring.io/blog/category/releases/
- https://nextjs.org/blog
- https://nodejs.org/en/download/current
- https://www.postgresql.org/support/versioning/
- https://postgis.net/docs/en/release_notes.html
- https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/release-notes/redisce/redisos-8.8-release-notes/
