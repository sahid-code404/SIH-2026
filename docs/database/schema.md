# Database Schema — Foundation

PostgreSQL + PostGIS is the authoritative data store.

Current migration history:

| Migration | Purpose |
|---|---|
| `V1__enable_postgis_and_bootstrap.sql` | Enable PostGIS and create the foundation bootstrap marker. |

`platform_bootstrap` is infrastructure metadata only. It is not a substitute for future domain tables.

Future domain migrations must use UUID identifiers, UTC timestamps, explicit foreign keys, NOT NULL/UNIQUE/CHECK constraints where applicable and indexes based on real query paths. JSONB is not to be used as a shortcut around modeling core business data.
