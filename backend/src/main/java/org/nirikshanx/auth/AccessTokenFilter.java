package org.nirikshanx.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import org.nirikshanx.authorization.AuthorizationRepository;
import org.nirikshanx.authorization.SessionAssuranceRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AccessTokenFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final AuthRepository repository;
    private final AuthorizationRepository authorizationRepository;
    private final SessionAssuranceRepository sessionAssuranceRepository;

    public AccessTokenFilter(
            JwtService jwtService,
            AuthRepository repository,
            AuthorizationRepository authorizationRepository,
            SessionAssuranceRepository sessionAssuranceRepository) {
        this.jwtService = jwtService;
        this.repository = repository;
        this.authorizationRepository = authorizationRepository;
        this.sessionAssuranceRepository = sessionAssuranceRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            String header = request.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ") && header.length() > 7) {
                String token = header.substring(7).trim();
                try {
                    JwtService.JwtClaims claims = jwtService.parseAndValidate(token);
                    repository.findActivePrincipal(claims.userId(), claims.sessionId(), Instant.now())
                            .ifPresent(row -> {
                                Instant mfaVerifiedAt = sessionAssuranceRepository
                                        .findMfaVerifiedAt(row.userId(), row.sessionId())
                                        .orElse(null);
                                AuthPrincipal principal = new AuthPrincipal(
                                        row.userId(),
                                        row.sessionId(),
                                        row.email(),
                                        row.displayName(),
                                        mfaVerifiedAt);
                                var authorities = authorizationRepository
                                        .listEffectivePermissionCodes(row.userId(), mfaVerifiedAt != null)
                                        .stream()
                                        .map(SimpleGrantedAuthority::new)
                                        .toList();
                                UsernamePasswordAuthenticationToken authentication =
                                        new UsernamePasswordAuthenticationToken(principal, null, authorities);
                                SecurityContextHolder.getContext().setAuthentication(authentication);
                            });
                } catch (JwtService.InvalidJwtException ignored) {
                    SecurityContextHolder.clearContext();
                }
            }
        }
        filterChain.doFilter(request, response);
    }
}
