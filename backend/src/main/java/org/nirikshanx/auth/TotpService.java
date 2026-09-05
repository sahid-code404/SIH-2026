package org.nirikshanx.auth;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.OptionalLong;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class TotpService {
    private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private static final int SECRET_BYTES = 20;
    private static final int CODE_DIGITS = 6;
    private static final long STEP_SECONDS = 30;

    private final SecureRandom secureRandom = new SecureRandom();
    private final byte[] encryptionKey;

    public TotpService(AuthProperties properties) {
        try {
            this.encryptionKey = Base64.getDecoder().decode(properties.mfaEncryptionKeyBase64());
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("AUTH_MFA_ENCRYPTION_KEY_BASE64 must be valid base64", exception);
        }
        if (encryptionKey.length != 32) {
            throw new IllegalStateException("AUTH_MFA_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
        }
    }

    public SecretMaterial generate(String email) {
        byte[] secret = new byte[SECRET_BYTES];
        secureRandom.nextBytes(secret);
        String base32 = base32(secret);
        String label = urlEncode("NirikshanX:" + email);
        String issuer = urlEncode("NirikshanX");
        String uri = "otpauth://totp/" + label + "?secret=" + base32 + "&issuer=" + issuer + "&algorithm=SHA1&digits=6&period=30";
        return new SecretMaterial(base32, uri, encrypt(secret));
    }

    public OptionalLong verifyEncrypted(String encryptedSecret, String code, Long lastCounter) {
        return verify(decrypt(encryptedSecret), code, lastCounter);
    }

    public OptionalLong verifyForEnrollment(String encryptedSecret, String code) {
        return verify(decrypt(encryptedSecret), code, null);
    }

    private OptionalLong verify(byte[] secret, String code, Long lastCounter) {
        if (code == null || !code.matches("\\d{6}")) return OptionalLong.empty();
        long currentCounter = Instant.now().getEpochSecond() / STEP_SECONDS;
        for (long offset = -1; offset <= 1; offset++) {
            long counter = currentCounter + offset;
            if (counter < 0 || (lastCounter != null && counter <= lastCounter)) continue;
            String expected = codeFor(secret, counter);
            if (constantTimeEquals(expected, code)) return OptionalLong.of(counter);
        }
        return OptionalLong.empty();
    }

    private String codeFor(byte[] secret, long counter) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] digest = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(counter).array());
            int offset = digest[digest.length - 1] & 0x0f;
            int binary = ((digest[offset] & 0x7f) << 24)
                    | ((digest[offset + 1] & 0xff) << 16)
                    | ((digest[offset + 2] & 0xff) << 8)
                    | (digest[offset + 3] & 0xff);
            int modulus = (int) Math.pow(10, CODE_DIGITS);
            return String.format("%0" + CODE_DIGITS + "d", binary % modulus);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("TOTP HMAC is unavailable", exception);
        }
    }

    private String encrypt(byte[] plaintext) {
        try {
            byte[] iv = new byte[12];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"), new GCMParameterSpec(128, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            byte[] packed = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, packed, 0, iv.length);
            System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(packed);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Unable to encrypt TOTP secret", exception);
        }
    }

    private byte[] decrypt(String encrypted) {
        try {
            byte[] packed = Base64.getDecoder().decode(encrypted);
            if (packed.length <= 12) throw new IllegalArgumentException("Invalid encrypted secret");
            byte[] iv = new byte[12];
            byte[] ciphertext = new byte[packed.length - iv.length];
            System.arraycopy(packed, 0, iv, 0, iv.length);
            System.arraycopy(packed, iv.length, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"), new GCMParameterSpec(128, iv));
            return cipher.doFinal(ciphertext);
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to decrypt TOTP secret", exception);
        }
    }

    private static String base32(byte[] data) {
        StringBuilder output = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bitsLeft = 0;
        for (byte value : data) {
            buffer = (buffer << 8) | (value & 0xff);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                output.append(BASE32[(buffer >>> (bitsLeft - 5)) & 0x1f]);
                bitsLeft -= 5;
            }
        }
        if (bitsLeft > 0) output.append(BASE32[(buffer << (5 - bitsLeft)) & 0x1f]);
        return output.toString();
    }

    private static boolean constantTimeEquals(String left, String right) {
        if (left.length() != right.length()) return false;
        int diff = 0;
        for (int i = 0; i < left.length(); i++) diff |= left.charAt(i) ^ right.charAt(i);
        return diff == 0;
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public record SecretMaterial(String base32Secret, String otpauthUri, String encryptedSecret) {
    }
}
