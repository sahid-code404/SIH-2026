package org.nirikshanx.auth;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class JwtService {
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder URL_DECODER = Base64.getUrlDecoder();
    private static final Set<String> ALLOWED_CLAIMS = Set.of("sub", "sid", "jti", "iss", "aud", "iat", "exp");

    private final AuthProperties properties;
    private final ObjectMapper objectMapper;
    private final byte[] secret;

    public JwtService(AuthProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        try {
            this.secret = Base64.getDecoder().decode(properties.jwtSecretBase64());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("AUTH_JWT_SECRET_BASE64 must be valid base64", exception);
        }
        if (secret.length < 32) {
            throw new IllegalStateException("AUTH_JWT_SECRET_BASE64 must decode to at least 32 bytes");
        }
        if (properties.accessTokenTtl() == null || properties.accessTokenTtl().isZero() || properties.accessTokenTtl().isNegative()) {
            throw new IllegalStateException("Access token TTL must be positive");
        }
    }

    public IssuedToken issue(UUID userId, UUID sessionId) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(properties.accessTokenTtl());
        String jti = UUID.randomUUID().toString();

        Map<String, Object> header = new LinkedHashMap<>();
        header.put("alg", "HS256");
        header.put("typ", "JWT");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sub", userId.toString());
        payload.put("sid", sessionId.toString());
        payload.put("jti", jti);
        payload.put("iss", properties.issuer());
        payload.put("aud", properties.audience());
        payload.put("iat", issuedAt.getEpochSecond());
        payload.put("exp", expiresAt.getEpochSecond());

        try {
            String encodedHeader = URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(header));
            String encodedPayload = URL_ENCODER.encodeToString(objectMapper.writeValueAsBytes(payload));
            String signingInput = encodedHeader + "." + encodedPayload;
            String signature = URL_ENCODER.encodeToString(hmac(signingInput));
            return new IssuedToken(signingInput + "." + signature, expiresAt);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to issue access token", exception);
        }
    }

    public JwtClaims parseAndValidate(String token) {
        if (token == null || token.isBlank()) throw new InvalidJwtException();
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) throw new InvalidJwtException();

        try {
            byte[] providedSignature = URL_DECODER.decode(parts[2]);
            byte[] expectedSignature = hmac(parts[0] + "." + parts[1]);
            if (!MessageDigest.isEqual(providedSignature, expectedSignature)) throw new InvalidJwtException();

            JsonNode header = objectMapper.readTree(URL_DECODER.decode(parts[0]));
            if (header.size() != 2 || !"HS256".equals(header.path("alg").asText()) || !"JWT".equals(header.path("typ").asText())) {
                throw new InvalidJwtException();
            }

            JsonNode payload = objectMapper.readTree(URL_DECODER.decode(parts[1]));
            if (payload.size() != ALLOWED_CLAIMS.size()) throw new InvalidJwtException();
            for (String claim : ALLOWED_CLAIMS) {
                if (!payload.hasNonNull(claim)) throw new InvalidJwtException();
            }

            String issuer = payload.path("iss").asText();
            String audience = payload.path("aud").asText();
            if (!properties.issuer().equals(issuer) || !properties.audience().equals(audience)) throw new InvalidJwtException();

            long issuedAtSeconds = payload.path("iat").asLong(Long.MIN_VALUE);
            long expiresAtSeconds = payload.path("exp").asLong(Long.MIN_VALUE);
            Instant now = Instant.now();
            Instant issuedAt = Instant.ofEpochSecond(issuedAtSeconds);
            Instant expiresAt = Instant.ofEpochSecond(expiresAtSeconds);
            if (!expiresAt.isAfter(now) || issuedAt.isAfter(now.plusSeconds(60)) || !expiresAt.isAfter(issuedAt)) {
                throw new InvalidJwtException();
            }
            if (expiresAt.isAfter(issuedAt.plus(properties.accessTokenTtl()).plusSeconds(5))) {
                throw new InvalidJwtException();
            }

            UUID userId = UUID.fromString(payload.path("sub").asText());
            UUID sessionId = UUID.fromString(payload.path("sid").asText());
            String jti = payload.path("jti").asText();
            if (jti.isBlank()) throw new InvalidJwtException();

            return new JwtClaims(userId, sessionId, jti, issuedAt, expiresAt);
        } catch (InvalidJwtException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new InvalidJwtException();
        }
    }

    private byte[] hmac(String value) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        return mac.doFinal(value.getBytes(StandardCharsets.US_ASCII));
    }

    public record IssuedToken(String value, Instant expiresAt) {
    }

    public record JwtClaims(UUID userId, UUID sessionId, String jti, Instant issuedAt, Instant expiresAt) {
    }

    public static class InvalidJwtException extends RuntimeException {
        public InvalidJwtException() {
            super("Invalid access token");
        }
    }
}
