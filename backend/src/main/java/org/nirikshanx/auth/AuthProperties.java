package org.nirikshanx.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "nirikshanx.auth")
public record AuthProperties(
        Duration accessTokenTtl,
        Duration sessionTtl,
        Duration mfaChallengeTtl,
        String issuer,
        String audience,
        String jwtSecretBase64,
        String mfaEncryptionKeyBase64,
        boolean cookieSecure,
        int loginMaxFailures,
        Duration loginWindow) {
}

@ConfigurationProperties(prefix = "nirikshanx.bootstrap-user")
record BootstrapUserProperties(
        boolean enabled,
        String email,
        String displayName,
        String password,
        String preferredLanguage) {
}
