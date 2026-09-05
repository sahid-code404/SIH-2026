package org.nirikshanx.auth;

import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class PasswordPolicy {
    private static final Set<String> COMMON = Set.of(
            "password", "password1", "password123", "12345678", "123456789", "1234567890",
            "qwerty123", "qwertyuiop", "admin123", "administrator", "letmein123", "welcome123",
            "iloveyou", "changeme", "changeit", "india123", "nirikshanx", "government", "govt12345");

    public void validate(String password, String email) {
        if (password == null || password.length() < 12 || password.length() > 128) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", "Password must be between 12 and 128 characters.");
        }

        String normalized = password.toLowerCase(Locale.ROOT);
        String compact = normalized.replaceAll("[^a-z0-9]", "");
        for (String common : COMMON) {
            if (normalized.equals(common) || compact.equals(common.replaceAll("[^a-z0-9]", ""))) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "COMMON_PASSWORD", "Choose a password that is not commonly used.");
            }
        }

        if (email != null) {
            String localPart = email.toLowerCase(Locale.ROOT).split("@", 2)[0];
            if (localPart.length() >= 4 && normalized.contains(localPart)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", "Password must not contain your email identifier.");
            }
        }
    }
}
