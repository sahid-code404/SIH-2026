package org.nirikshanx.institution;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class InstitutionRepository {
    private final JdbcClient jdbc;

    public InstitutionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public PageRows searchAccessible(UUID userId, SearchCriteria criteria) {
        StringBuilder filters = new StringBuilder(accessPredicate());
        if (criteria.search() != null) {
            filters.append("""
                    AND (
                        lower(i.code) LIKE :search
                        OR lower(i.legal_name) LIKE :search
                        OR lower(i.display_name) LIKE :search
                        OR lower(COALESCE(i.registration_number, '')) LIKE :search
                    )
                    """);
        }
        if (criteria.stateId() != null) filters.append(" AND i.state_id = :stateId\n");
        if (criteria.districtId() != null) filters.append(" AND i.district_id = :districtId\n");
        if (criteria.status() != null) filters.append(" AND i.status = :status\n");
        if (criteria.institutionType() != null) filters.append(" AND i.institution_type = :institutionType\n");

        String from = """
                FROM institutions i
                JOIN states s ON s.id = i.state_id
                JOIN districts d ON d.id = i.district_id
                """;

        JdbcClient.StatementSpec countSpec = bind(
                jdbc.sql("SELECT count(*) " + from + " WHERE " + filters), userId, criteria);
        Long total = countSpec.query(Long.class).single();

        String orderBy = switch (criteria.sort()) {
            case "code" -> "i.code";
            case "createdAt" -> "i.created_at";
            default -> "lower(i.display_name)";
        };
        String direction = "desc".equals(criteria.direction()) ? "DESC" : "ASC";

        String select = """
                SELECT i.id, i.code, i.legal_name, i.display_name, i.institution_type,
                       i.registration_number, i.status, i.state_id, s.code AS state_code, s.name AS state_name,
                       i.district_id, d.code AS district_code, d.name AS district_name,
                       i.address, i.postal_code,
                       ST_Y(i.location::geometry) AS latitude,
                       ST_X(i.location::geometry) AS longitude,
                       i.geofence_radius_m,
                       i.primary_contact_name, i.primary_contact_email, i.primary_contact_phone,
                       i.verification_status, i.created_at, i.updated_at
                """;
        JdbcClient.StatementSpec dataSpec = bind(
                jdbc.sql(select + from + " WHERE " + filters
                        + " ORDER BY " + orderBy + " " + direction + ", i.id ASC LIMIT :limit OFFSET :offset"),
                userId,
                criteria)
                .param("limit", criteria.limit())
                .param("offset", criteria.offset());

        return new PageRows(dataSpec.query(InstitutionRow.class).list(), total == null ? 0 : total);
    }

    public Optional<InstitutionRow> findAccessible(UUID userId, UUID institutionId) {
        return jdbc.sql("""
                SELECT i.id, i.code, i.legal_name, i.display_name, i.institution_type,
                       i.registration_number, i.status, i.state_id, s.code AS state_code, s.name AS state_name,
                       i.district_id, d.code AS district_code, d.name AS district_name,
                       i.address, i.postal_code,
                       ST_Y(i.location::geometry) AS latitude,
                       ST_X(i.location::geometry) AS longitude,
                       i.geofence_radius_m,
                       i.primary_contact_name, i.primary_contact_email, i.primary_contact_phone,
                       i.verification_status, i.created_at, i.updated_at
                  FROM institutions i
                  JOIN states s ON s.id = i.state_id
                  JOIN districts d ON d.id = i.district_id
                 WHERE i.id = :institutionId
                   AND (""" + accessPredicate() + ")")
                .param("institutionId", institutionId)
                .param("userId", userId)
                .query(InstitutionRow.class)
                .optional();
    }

    public Optional<InstitutionRow> findById(UUID institutionId) {
        return jdbc.sql("""
                SELECT i.id, i.code, i.legal_name, i.display_name, i.institution_type,
                       i.registration_number, i.status, i.state_id, s.code AS state_code, s.name AS state_name,
                       i.district_id, d.code AS district_code, d.name AS district_name,
                       i.address, i.postal_code,
                       ST_Y(i.location::geometry) AS latitude,
                       ST_X(i.location::geometry) AS longitude,
                       i.geofence_radius_m,
                       i.primary_contact_name, i.primary_contact_email, i.primary_contact_phone,
                       i.verification_status, i.created_at, i.updated_at
                  FROM institutions i
                  JOIN states s ON s.id = i.state_id
                  JOIN districts d ON d.id = i.district_id
                 WHERE i.id = :institutionId
                """)
                .param("institutionId", institutionId)
                .query(InstitutionRow.class)
                .optional();
    }

    public boolean hasAccess(UUID userId, UUID institutionId) {
        Long count = jdbc.sql("SELECT count(*) FROM institutions i WHERE i.id = :institutionId AND (" + accessPredicate() + ")")
                .param("institutionId", institutionId)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return count != null && count > 0;
    }

    public boolean codeExists(String code, UUID excludingId) {
        String sql = excludingId == null
                ? "SELECT count(*) FROM institutions WHERE code = :code"
                : "SELECT count(*) FROM institutions WHERE code = :code AND id <> :excludingId";
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("code", code);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        Long count = spec.query(Long.class).single();
        return count != null && count > 0;
    }

    public boolean registrationExists(String registrationNumber, UUID excludingId) {
        if (registrationNumber == null) return false;
        String sql = excludingId == null
                ? "SELECT count(*) FROM institutions WHERE lower(registration_number) = lower(:registrationNumber)"
                : "SELECT count(*) FROM institutions WHERE lower(registration_number) = lower(:registrationNumber) AND id <> :excludingId";
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("registrationNumber", registrationNumber);
        if (excludingId != null) spec = spec.param("excludingId", excludingId);
        Long count = spec.query(Long.class).single();
        return count != null && count > 0;
    }

    public InstitutionRow insert(InstitutionWrite row) {
        jdbc.sql("""
                INSERT INTO institutions (
                    id, code, legal_name, display_name, institution_type, registration_number, status,
                    state_id, district_id, address, postal_code, location, geofence_radius_m,
                    primary_contact_name, primary_contact_email, primary_contact_phone, verification_status
                ) VALUES (
                    :id, :code, :legalName, :displayName, :institutionType, :registrationNumber, :status,
                    :stateId, :districtId, :address, :postalCode,
                    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography, :geofenceRadiusM,
                    :primaryContactName, :primaryContactEmail, :primaryContactPhone, :verificationStatus
                )
                """)
                .param("id", row.id())
                .param("code", row.code())
                .param("legalName", row.legalName())
                .param("displayName", row.displayName())
                .param("institutionType", row.institutionType())
                .param("registrationNumber", row.registrationNumber())
                .param("status", row.status())
                .param("stateId", row.stateId())
                .param("districtId", row.districtId())
                .param("address", row.address())
                .param("postalCode", row.postalCode())
                .param("longitude", row.longitude())
                .param("latitude", row.latitude())
                .param("geofenceRadiusM", row.geofenceRadiusM())
                .param("primaryContactName", row.primaryContactName())
                .param("primaryContactEmail", row.primaryContactEmail())
                .param("primaryContactPhone", row.primaryContactPhone())
                .param("verificationStatus", row.verificationStatus())
                .update();
        return findById(row.id()).orElseThrow();
    }

    public InstitutionRow update(InstitutionWrite row) {
        jdbc.sql("""
                UPDATE institutions
                   SET code = :code,
                       legal_name = :legalName,
                       display_name = :displayName,
                       institution_type = :institutionType,
                       registration_number = :registrationNumber,
                       status = :status,
                       state_id = :stateId,
                       district_id = :districtId,
                       address = :address,
                       postal_code = :postalCode,
                       location = ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                       geofence_radius_m = :geofenceRadiusM,
                       primary_contact_name = :primaryContactName,
                       primary_contact_email = :primaryContactEmail,
                       primary_contact_phone = :primaryContactPhone,
                       verification_status = :verificationStatus
                 WHERE id = :id
                """)
                .param("id", row.id())
                .param("code", row.code())
                .param("legalName", row.legalName())
                .param("displayName", row.displayName())
                .param("institutionType", row.institutionType())
                .param("registrationNumber", row.registrationNumber())
                .param("status", row.status())
                .param("stateId", row.stateId())
                .param("districtId", row.districtId())
                .param("address", row.address())
                .param("postalCode", row.postalCode())
                .param("longitude", row.longitude())
                .param("latitude", row.latitude())
                .param("geofenceRadiusM", row.geofenceRadiusM())
                .param("primaryContactName", row.primaryContactName())
                .param("primaryContactEmail", row.primaryContactEmail())
                .param("primaryContactPhone", row.primaryContactPhone())
                .param("verificationStatus", row.verificationStatus())
                .update();
        return findById(row.id()).orElseThrow();
    }

    public List<MembershipRow> listActiveMemberships(UUID institutionId) {
        return jdbc.sql("""
                SELECT im.id, im.institution_id, im.user_id, u.email, u.display_name,
                       im.assignment_source, im.assigned_at
                  FROM institution_memberships im
                  JOIN users u ON u.id = im.user_id
                 WHERE im.institution_id = :institutionId
                   AND im.revoked_at IS NULL
                 ORDER BY lower(u.display_name), u.id
                """)
                .param("institutionId", institutionId)
                .query(MembershipRow.class)
                .list();
    }

    public boolean hasActiveMembership(UUID institutionId, UUID userId) {
        Long count = jdbc.sql("""
                SELECT count(*) FROM institution_memberships
                 WHERE institution_id = :institutionId AND user_id = :userId AND revoked_at IS NULL
                """)
                .param("institutionId", institutionId)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return count != null && count > 0;
    }

    public MembershipRow addMembership(UUID id, UUID institutionId, UUID userId, UUID actorUserId, Instant now) {
        jdbc.sql("""
                INSERT INTO institution_memberships (
                    id, institution_id, user_id, assigned_by_user_id, assignment_source, assigned_at
                ) VALUES (:id, :institutionId, :userId, :actorUserId, 'ADMIN', :now)
                """)
                .param("id", id)
                .param("institutionId", institutionId)
                .param("userId", userId)
                .param("actorUserId", actorUserId)
                .param("now", dbTime(now))
                .update();
        return jdbc.sql("""
                SELECT im.id, im.institution_id, im.user_id, u.email, u.display_name,
                       im.assignment_source, im.assigned_at
                  FROM institution_memberships im
                  JOIN users u ON u.id = im.user_id
                 WHERE im.id = :id
                """)
                .param("id", id)
                .query(MembershipRow.class)
                .single();
    }

    public int revokeMembership(UUID membershipId, UUID institutionId, UUID actorUserId, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE institution_memberships
                   SET revoked_at = :now, revoked_by_user_id = :actorUserId, revocation_reason = :reason
                 WHERE id = :membershipId
                   AND institution_id = :institutionId
                   AND revoked_at IS NULL
                """)
                .param("now", dbTime(now))
                .param("actorUserId", actorUserId)
                .param("reason", reason)
                .param("membershipId", membershipId)
                .param("institutionId", institutionId)
                .update();
    }

    public List<StateRow> states() {
        return jdbc.sql("SELECT id, code, name FROM states ORDER BY name, id")
                .query(StateRow.class).list();
    }

    public List<DistrictRow> districts(UUID stateId) {
        return jdbc.sql("SELECT id, state_id, code, name FROM districts WHERE state_id = :stateId ORDER BY name, id")
                .param("stateId", stateId)
                .query(DistrictRow.class).list();
    }

    private JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec, UUID userId, SearchCriteria criteria) {
        spec = spec.param("userId", userId);
        if (criteria.search() != null) spec = spec.param("search", criteria.search());
        if (criteria.stateId() != null) spec = spec.param("stateId", criteria.stateId());
        if (criteria.districtId() != null) spec = spec.param("districtId", criteria.districtId());
        if (criteria.status() != null) spec = spec.param("status", criteria.status());
        if (criteria.institutionType() != null) spec = spec.param("institutionType", criteria.institutionType());
        return spec;
    }

    private static String accessPredicate() {
        return """
                (
                    EXISTS (
                        SELECT 1
                          FROM institution_memberships im
                         WHERE im.institution_id = i.id
                           AND im.user_id = :userId
                           AND im.revoked_at IS NULL
                    )
                    OR EXISTS (
                        SELECT 1
                          FROM user_jurisdictions uj
                         WHERE uj.user_id = :userId
                           AND uj.revoked_at IS NULL
                           AND (
                                uj.scope_type = 'NATIONAL'
                                OR (uj.scope_type = 'STATE' AND uj.state_id = i.state_id)
                                OR (uj.scope_type = 'DISTRICT' AND uj.district_id = i.district_id)
                           )
                    )
                )
                """;
    }

    private static OffsetDateTime dbTime(Instant value) {
        return OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    public record SearchCriteria(
            String search,
            UUID stateId,
            UUID districtId,
            String status,
            String institutionType,
            String sort,
            String direction,
            int limit,
            long offset) {
    }

    public record PageRows(List<InstitutionRow> items, long total) {
    }

    public record InstitutionWrite(
            UUID id,
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

    public record InstitutionRow(
            UUID id,
            String code,
            String legalName,
            String displayName,
            String institutionType,
            String registrationNumber,
            String status,
            UUID stateId,
            String stateCode,
            String stateName,
            UUID districtId,
            String districtCode,
            String districtName,
            String address,
            String postalCode,
            double latitude,
            double longitude,
            int geofenceRadiusM,
            String primaryContactName,
            String primaryContactEmail,
            String primaryContactPhone,
            String verificationStatus,
            Instant createdAt,
            Instant updatedAt) {
    }

    public record MembershipRow(
            UUID id,
            UUID institutionId,
            UUID userId,
            String email,
            String displayName,
            String assignmentSource,
            Instant assignedAt) {
    }

    public record StateRow(UUID id, String code, String name) {
    }

    public record DistrictRow(UUID id, UUID stateId, String code, String name) {
    }
}
