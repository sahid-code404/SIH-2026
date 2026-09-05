package org.nirikshanx.auth;

import java.util.UUID;

public record AuthPrincipal(
        UUID userId,
        UUID sessionId,
        String email,
        String displayName,
        boolean mfaVerified) {
}
