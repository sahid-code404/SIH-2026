package org.nirikshanx.auth;

import java.util.UUID;
import org.nirikshanx.authorization.AuthorizationRepository;
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
    private final AuthorizationRepository authorizationRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;

    public BootstrapUserInitializer(
            BootstrapUserProperties properties,
            AuthRepository repository,
            AuthorizationRepository authorizationRepository,
            PasswordEncoder passwordEncoder,
            PasswordPolicy passwordPolicy) {
        this.properties = properties;
        this.repository = repository;
        this.authorizationRepository = authorizationRepository;
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

        AuthRepository.UserRow existing = repository.findUserByEmail(email).orElse(null);
        if (existing != null) {
            authorizationRepository.ensureBootstrapSystemAdmin(existing.id());
            log.info("Local bootstrap user already exists; credentials unchanged and bootstrap authorization ensured");
            return;
        }

        passwordPolicy.validate(properties.password(), email);
        String preferredLanguage = properties.preferredLanguage() == null || properties.preferredLanguage().isBlank()
                ? "en"
                : properties.preferredLanguage().trim();
        UUID userId = UUID.randomUUID();
        repository.insertUser(
                userId,
                email,
                properties.displayName().trim(),
                passwordEncoder.encode(properties.password()),
                preferredLanguage);
        authorizationRepository.ensureBootstrapSystemAdmin(userId);
        log.info("Created local bootstrap system administrator from explicit environment configuration");
    }
}
