package org.nirikshanx.institution;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.nirikshanx.auth.ApiException;
import org.nirikshanx.auth.AuthPrincipal;
import org.nirikshanx.authorization.AuthorizationRepository;
import org.nirikshanx.authorization.AuthorizationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InstitutionService {
    private static final Pattern POLICY_CODE = Pattern.compile("^[A-Z][A-Z0-9_]{1,63}$");
    private static final Pattern INSTITUTION_CODE = Pattern.compile("^[A-Z0-9][A-Z0-9._/-]{1,63}$");

    private final InstitutionRepository repository;
    private final AuthorizationService authorization;
    private final AuthorizationRepository authorizationRepository;

    public InstitutionService(
            InstitutionRepository repository,
            AuthorizationService authorization,
            AuthorizationRepository authorizationRepository) {
        this.repository = repository;
        this.authorization = authorization;
        this.authorizationRepository = authorizationRepository;
    }

    public InstitutionPage search(
            AuthPrincipal principal,
            String query,
            UUID stateId,
            UUID districtId,
            String status,
            String institutionType,
            String sort,
            String direction,
            int page,
            int size) {
        authorization.requirePermission(principal, "institution.read");
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 100));
        String normalizedSearch = blankToNull(query);
        if (normalizedSearch != null) normalizedSearch = normalizedSearch.toLowerCase(Locale.ROOT) + "%";
        String normalizedStatus = optionalPolicyCode(status, "status");
        String normalizedType = optionalPolicyCode(institutionType, "institutionType");
        String safeSort = switch (sort == null ? "" : sort) {
            case "code" -> "code";
            case "createdAt" -> "createdAt";
            default -> "displayName";
        };
        String safeDirection = "desc".equalsIgnoreCase(direction) ? "desc" : "asc";
        long offset = (long) safePage * safeSize;

        InstitutionRepository.PageRows rows = repository.searchAccessible(
                principal.userId(),
                new InstitutionRepository.SearchCriteria(
                        normalizedSearch,
                        stateId,
                        districtId,
                        normalizedStatus,
                        normalizedType,
                        safeSort,
                        safeDirection,
                        safeSize,
                        offset));
        long totalPages = rows.total() == 0 ? 0 : (rows.total() + safeSize - 1) / safeSize;
        return new InstitutionPage(rows.items(), rows.total(), safePage, safeSize, totalPages);
    }

    public InstitutionRepository.InstitutionRow get(AuthPrincipal principal, UUID institutionId) {
        authorization.requirePermission(principal, "institution.read");
        return accessible(principal, institutionId);
    }

    @Transactional
    public InstitutionRepository.InstitutionRow create(AuthPrincipal principal, InstitutionInput input) {
        authorization.requirePermission(principal, "institution.create");
        InstitutionRepository.InstitutionWrite write = normalize(UUID.randomUUID(), input);
        validateGeography(write.stateId(), write.districtId());
        if (!authorization.canAccessDistrict(principal, write.districtId())) {
            throw denied();
        }
        ensureUnique(write, null);
        return repository.insert(write);
    }

    @Transactional
    public InstitutionRepository.InstitutionRow update(AuthPrincipal principal, UUID institutionId, InstitutionInput input) {
        authorization.requirePermission(principal, "institution.update");
        InstitutionRepository.InstitutionRow existing = accessible(principal, institutionId);
        InstitutionRepository.InstitutionWrite write = normalize(institutionId, input);
        validateGeography(write.stateId(), write.districtId());

        boolean geographyChanged = !existing.stateId().equals(write.stateId())
                || !existing.districtId().equals(write.districtId());
        if (geographyChanged && !authorization.canAccessDistrict(principal, write.districtId())) {
            throw denied();
        }
        ensureUnique(write, institutionId);
        return repository.update(write);
    }

    public List<InstitutionRepository.MembershipRow> memberships(AuthPrincipal principal, UUID institutionId) {
        authorization.requirePermission(principal, "institution.update");
        accessible(principal, institutionId);
        return repository.listActiveMemberships(institutionId);
    }

    @Transactional
    public InstitutionRepository.MembershipRow addMembership(AuthPrincipal principal, UUID institutionId, UUID userId) {
        authorization.requirePermission(principal, "institution.update");
        accessible(principal, institutionId);
        if (userId == null || !authorizationRepository.userExists(userId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MEMBER", "The selected user does not exist.");
        }
        if (repository.hasActiveMembership(institutionId, userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "MEMBERSHIP_ALREADY_ACTIVE", "The user already has active membership for this institution.");
        }
        return repository.addMembership(UUID.randomUUID(), institutionId, userId, principal.userId(), Instant.now());
    }

    @Transactional
    public void revokeMembership(AuthPrincipal principal, UUID institutionId, UUID membershipId, String reason) {
        authorization.requirePermission(principal, "institution.update");
        accessible(principal, institutionId);
        String normalizedReason = requiredText(reason, "reason", 240);
        int changed = repository.revokeMembership(
                membershipId,
                institutionId,
                principal.userId(),
                normalizedReason,
                Instant.now());
        if (changed == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "MEMBERSHIP_NOT_FOUND", "Active membership was not found.");
        }
    }

    public List<InstitutionRepository.StateRow> states(AuthPrincipal principal) {
        requireInstitutionLookupPermission(principal);
        return repository.states();
    }

    public List<InstitutionRepository.DistrictRow> districts(AuthPrincipal principal, UUID stateId) {
        requireInstitutionLookupPermission(principal);
        if (stateId == null || authorizationRepository.findState(stateId).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_STATE", "State was not found.");
        }
        return repository.districts(stateId);
    }

    private void requireInstitutionLookupPermission(AuthPrincipal principal) {
        var permissions = authorization.current(principal).effectivePermissions();
        if (!permissions.contains("institution.read") && !permissions.contains("institution.create")) {
            throw denied();
        }
    }

    private InstitutionRepository.InstitutionRow accessible(AuthPrincipal principal, UUID institutionId) {
        if (institutionId == null) throw notFound();
        return repository.findAccessible(principal.userId(), institutionId).orElseThrow(InstitutionService::notFound);
    }

    private void validateGeography(UUID stateId, UUID districtId) {
        if (stateId == null || districtId == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_GEOGRAPHY", "State and district are required.");
        }
        AuthorizationRepository.DistrictRow district = authorizationRepository.findDistrict(districtId)
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DISTRICT", "District was not found."));
        if (!stateId.equals(district.stateId())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DISTRICT_STATE_MISMATCH", "District is not valid for the selected state.");
        }
    }

    private void ensureUnique(InstitutionRepository.InstitutionWrite write, UUID excludingId) {
        if (repository.codeExists(write.code(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "INSTITUTION_CODE_EXISTS", "Institution code is already in use.");
        }
        if (repository.registrationExists(write.registrationNumber(), excludingId)) {
            throw new ApiException(HttpStatus.CONFLICT, "REGISTRATION_NUMBER_EXISTS", "Registration number is already in use.");
        }
    }

    private InstitutionRepository.InstitutionWrite normalize(UUID id, InstitutionInput input) {
        if (input == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Institution data is required.");
        }
        String code = requiredText(input.code(), "code", 64).toUpperCase(Locale.ROOT);
        if (!INSTITUTION_CODE.matcher(code).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_INSTITUTION_CODE", "Institution code must use uppercase letters, numbers, '.', '_', '/', or '-'.");
        }
        String institutionType = requiredPolicyCode(input.institutionType(), "institutionType");
        String status = requiredPolicyCode(input.status(), "status");
        String verificationStatus = requiredPolicyCode(input.verificationStatus(), "verificationStatus");
        String registration = blankToNull(input.registrationNumber());
        if (registration != null && registration.length() > 120) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REGISTRATION_NUMBER", "Registration number must not exceed 120 characters.");
        }
        String email = blankToNull(input.primaryContactEmail());
        if (email != null) {
            email = email.toLowerCase(Locale.ROOT);
            if (email.length() > 320 || !email.contains("@")) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CONTACT_EMAIL", "Primary contact email is invalid.");
            }
        }
        String phone = blankToNull(input.primaryContactPhone());
        if (phone != null && (phone.length() < 5 || phone.length() > 32)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CONTACT_PHONE", "Primary contact phone must contain 5 to 32 characters.");
        }
        if (!Double.isFinite(input.latitude()) || input.latitude() < -90 || input.latitude() > 90
                || !Double.isFinite(input.longitude()) || input.longitude() < -180 || input.longitude() > 180) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_LOCATION", "Latitude or longitude is outside the valid WGS84 range.");
        }
        if (input.geofenceRadiusM() <= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_GEOFENCE", "Geofence radius must be greater than zero metres.");
        }

        return new InstitutionRepository.InstitutionWrite(
                id,
                code,
                requiredText(input.legalName(), "legalName", 240),
                requiredText(input.displayName(), "displayName", 200),
                institutionType,
                registration,
                status,
                input.stateId(),
                input.districtId(),
                requiredText(input.address(), "address", 500),
                requiredText(input.postalCode(), "postalCode", 20),
                input.latitude(),
                input.longitude(),
                input.geofenceRadiusM(),
                requiredText(input.primaryContactName(), "primaryContactName", 160),
                email,
                phone,
                verificationStatus);
    }

    private static String requiredPolicyCode(String value, String field) {
        String normalized = requiredText(value, field, 64).toUpperCase(Locale.ROOT);
        if (!POLICY_CODE.matcher(normalized).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_POLICY_CODE", field + " must be a normalized code using letters, numbers and underscores.");
        }
        return normalized;
    }

    private static String optionalPolicyCode(String value, String field) {
        String normalized = blankToNull(value);
        return normalized == null ? null : requiredPolicyCode(normalized, field);
    }

    private static String requiredText(String value, String field, int max) {
        String normalized = blankToNull(value);
        if (normalized == null || normalized.length() > max) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FIELD", field + " is required and must not exceed " + max + " characters.");
        }
        return normalized;
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private static ApiException denied() {
        return new ApiException(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Access denied.");
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "INSTITUTION_NOT_FOUND", "Institution was not found.");
    }

    public record InstitutionInput(
            String code,
            String legalName,
            String displayName,
            String institutionType,
            String registrationNumber,
            String status,
            UUID stateId,
            UUID districtId,
            String address,
            String postalCode,
            double latitude,
            double longitude,
            int geofenceRadiusM,
            String primaryContactName,
            String primaryContactEmail,
            String primaryContactPhone,
            String verificationStatus) {
    }

    public record InstitutionPage(
            List<InstitutionRepository.InstitutionRow> items,
            long total,
            int page,
            int size,
            long totalPages) {
    }
}
