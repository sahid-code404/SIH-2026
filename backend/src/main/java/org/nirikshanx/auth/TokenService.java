package org.nirikshanx.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.stereotype.Component;

@Component
public class TokenService {
    private static final char[] HEX = "0123456789abcdef".toCharArray();
    private final SecureRandom secureRandom = new SecureRandom();

    public String randomToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            char[] output = new char[hash.length * 2];
            for (int i = 0; i < hash.length; i++) {
                int unsigned = hash[i] & 0xff;
                output[i * 2] = HEX[unsigned >>> 4];
                output[i * 2 + 1] = HEX[unsigned & 0x0f];
            }
            return new String(output);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public String nullableHash(String value) {
        if (value == null || value.isBlank()) return null;
        return sha256Hex(value.trim());
    }

    public String truncateUserAgent(String value) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim();
        return trimmed.length() <= 512 ? trimmed : trimmed.substring(0, 512);
    }
}
