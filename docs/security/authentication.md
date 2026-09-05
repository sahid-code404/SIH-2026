# Authentication and Session Security

NirikshanX Phase 4 introduces authentication only. Authorization roles, permissions, jurisdiction rules and institution membership remain deliberately outside this phase.

## Identity and password storage

- Users are stored in PostgreSQL with UUID primary keys and normalized lowercase email addresses.
- Passwords are encoded with Argon2id; plaintext passwords are never persisted.
- Password changes require the current password, reject unchanged/common passwords, and revoke other active sessions.
- Disabled or locked accounts cannot authenticate.

## Access tokens

The backend issues short-lived HMAC-signed JWT access tokens. The access-token payload is intentionally small and contains only:

- `sub` — user ID
- `sid` — session ID
- `jti` — token ID
- `iss` — issuer
- `aud` — audience
- `iat` — issued-at timestamp
- `exp` — expiry timestamp

The default local access-token lifetime is ten minutes. Access tokens are held only in frontend runtime memory. They must not be written to `localStorage`, `sessionStorage`, IndexedDB, service-worker caches, URLs, logs or persistent browser state.

## Refresh sessions

Refresh credentials are cryptographically random opaque values transported in an HttpOnly, SameSite=Strict cookie. `Secure` is disabled only for the explicit local HTTP development profile and must be enabled for non-local deployments.

Only SHA-256 hashes of refresh credentials are stored in PostgreSQL. Refresh credentials rotate on every successful refresh. A refresh token is one-time-use: reuse of a consumed token revokes the affected session/token family and writes a security event.

Session-backed access-token validation means revoking a session invalidates subsequently presented access tokens from that session even when their JWT `exp` has not yet elapsed.

## MFA

TOTP enrollment creates a secret that is encrypted before persistence. The plaintext enrollment secret is returned only during the enrollment response so the user can provision an authenticator.

After confirmation, TOTP is required during login for that user. The backend stores the last accepted counter and rejects replay of an already accepted TOTP time step. Mandatory-MFA policy by role is intentionally deferred to the Authorization phase.

## Login abuse controls and audit

Failed password attempts are persisted as authentication events using a one-way subject hash rather than storing submitted credentials. Recent failures are counted server-side and the default local threshold is five failures within fifteen minutes.

Authentication failure paths that intentionally persist audit or revocation state use transactions configured not to roll back on the domain `ApiException`. This is required so failed-login events, MFA failures, rate-limit events and refresh-token reuse revocations remain durable even though the HTTP request ends in an error response.

Authentication API errors include a request ID for correlation without exposing secrets.

## Local bootstrap user

A deterministic bootstrap user exists only when `BOOTSTRAP_USER_ENABLED=true`. The Compose development environment enables it to make the real authentication vertical slice testable. Production deployments must disable bootstrap and replace all local JWT/MFA secrets and credentials.

## Verification

CI starts the real Compose stack and executes `scripts/verify_authentication.mjs`. The verifier checks:

- Flyway V3 and the real bootstrap user
- Argon2id password storage
- password login and `/me`
- compact JWT claim contract and short expiry
- HttpOnly refresh cookie policy
- hash-only refresh persistence
- one-time refresh rotation and replay-triggered revocation
- password change and disabled-account rejection
- TOTP enrollment, login and replay resistance
- targeted session revocation and logout-all
- persisted failed-login rate limiting and authentication security events

The browser smoke suite also verifies responsive `/login` rendering while existing design-system/browser regression checks remain active.
