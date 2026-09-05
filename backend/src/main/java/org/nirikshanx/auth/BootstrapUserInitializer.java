package org.nirikshanx.auth;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class BootstrapUserInitializer implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BootstrapUserInitializer.class);

    private final BootstrapUserProperties properties;
    private final AuthRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;

    public BootstrapUserInitializer(
            BootstrapUserProperties properties,
            AuthRepository repository,
            PasswordEncoder passwordEncoder,
            PasswordPolicy passwordPolicy) {
        this.properties = properties;
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!properties.enabled()) return;

        String email = AuthService.normalizeEmail(properties.email());
        if (email.isBlank() || !email.contains("@")) {
            throw new IllegalStateException("BOOTSTRAP_USER_EMAIL must be a valid email when bootstrap is enabled");
        }
        if (properties.displayName() == null || properties.displayName().isBlank()) {
            throw new IllegalStateException("BOOTSTRAP_USER_DISPLAY_NAME is required when bootstrap is enabled");
        }
        if (properties.password() == null) {
            throw new IllegalStateException("BOOTSTRAP_USER_PASSWORD is required when bootstrap is enabled");
        }

        if (repository.findUserByEmail(email).isPresent()) {
            log.info("Local bootstrap user already exists; leaving credentials unchanged");
            return;
        }

        passwordPolicy.validate(properties.password(), email);
        String preferredLanguage = properties.preferredLanguage() == null || properties.preferredLanguage().isBlank()
                ? "en"
                : properties.preferredLanguage().trim();
        repository.insertUser(
                UUID.randomUUID(),
                email,
                properties.displayName().trim(),
                passwordEncoder.encode(properties.password()),
                preferredLanguage);
        log.info("Created local bootstrap user from explicit environment configuration");
    }
}
