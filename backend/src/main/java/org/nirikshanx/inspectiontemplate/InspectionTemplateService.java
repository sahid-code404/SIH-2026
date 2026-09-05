package org.nirikshanx.inspectiontemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.nirikshanx.auth.ApiException;
import org.nirikshanx.auth.AuthPrincipal;
import org.nirikshanx.authorization.AuthorizationService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InspectionTemplateService {
    private static final Pattern CODE = Pattern.compile("^[A-Z0-9][A-Z0-9._/-]{1,63}$");
    private static final Pattern OPTION_VALUE = Pattern.compile("^[A-Z0-9][A-Z0-9._/-]{0,95}$");

    public static final Set<String> QUESTION_TYPES = Set.of(
            "YES_NO", "TEXT", "LONG_TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "MULTI_SELECT",
            "PHOTO", "VIDEO", "DOCUMENT", "LOCATION_CONFIRMATION");
    public static final Set<String> CONDITION_OPERATORS = Set.of(
            "EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_CONTAINS",
            "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL",
            "IS_EMPTY", "IS_NOT_EMPTY");
    public static final Set<String> EVIDENCE_TYPES = Set.of("PHOTO", "VIDEO", "DOCUMENT", "LOCATION_CONFIRMATION");

    private final InspectionTemplateRepository repository;
    private final AuthorizationService authorization;

    public InspectionTemplateService(InspectionTemplateRepository repository, AuthorizationService authorization) {
        this.repository = repository;
        this.authorization = authorization;
    }

    public PageView<TemplateSummary> templates(AuthPrincipal principal, String query, int page, int size) {
        authorization.requirePermission(principal, "inspection.read");
        int safePage = Math.max(0, page);
        int safeSize = Math.min(100, Math.max(1, size));
        String search = normalizeSearch(query);
        InspectionTemplateRepository.PageRows<InspectionTemplateRepository.TemplateRow> rows =
                repository.searchTemplates(search, safeSize, safePage * safeSize);
        boolean author = canAuthor(principal);
        List<TemplateSummary> items = rows.items().stream().map(row -> new TemplateSummary(
                row.id(), row.code(), row.name(), row.description(), row.latestPublishedVersion(),
                author ? row.draftVersion() : null, row.createdAt(), row.updatedAt())).toList();
        int pages = rows.total() == 0 ? 0 : (int) Math.ceil((double) rows.total() / safeSize);
        return new PageView<>(items, rows.total(), safePage, safeSize, pages);
    }

    public TemplateDetail template(AuthPrincipal principal, UUID templateId) {
        authorization.requirePermission(principal, "inspection.read");
        InspectionTemplateRepository.TemplateRow template = requireTemplate(templateId);
        boolean author = canAuthor(principal);
        List<VersionSummary> versions = repository.listVersions(templateId).stream()
                .filter(row -> author || "PUBLISHED".equals(row.status()))
                .map(this::summary)
                .toList();
        return new TemplateDetail(summary(template, author), versions, author);
    }

    public VersionGraph version(AuthPrincipal principal, UUID templateId, UUID versionId) {
        authorization.requirePermission(principal, "inspection.read");
        InspectionTemplateRepository.VersionRow version = requireVersion(templateId, versionId);
        if ("DRAFT".equals(version.status()) && !canAuthor(principal)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_VERSION_NOT_FOUND", "Inspection template version was not found.");
        }
        return loadGraph(version);
    }

    @Transactional
    public TemplateDetail create(AuthPrincipal principal, TemplateCreateInput input) {
        authorization.requirePermission(principal, "inspection.create");
        String code = normalizedCode(input == null ? null : input.code(), "Template code");
        String name = text(input == null ? null : input.name(), "Template name", 240, true);
        String description = text(input == null ? null : input.description(), "Description", 2000, false);
        if (repository.templateCodeExists(code)) {
            throw new ApiException(HttpStatus.CONFLICT, "TEMPLATE_CODE_EXISTS", "An inspection template with that code already exists.");
        }
        UUID templateId = UUID.randomUUID();
        try {
            repository.insertTemplate(templateId, code, name, description, principal.userId());
            repository.insertVersion(UUID.randomUUID(), templateId, 1, "Initial draft", principal.userId());
        } catch (DataIntegrityViolationException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "TEMPLATE_CONFLICT", "The inspection template could not be created because its identity changed concurrently.");
        }
        return template(principal, templateId);
    }

    @Transactional
    public VersionGraph replaceDraft(
            AuthPrincipal principal, UUID templateId, UUID versionId, DraftGraphInput input) {
        authorization.requirePermission(principal, "inspection.create");
        InspectionTemplateRepository.VersionRow version = requireVersion(templateId, versionId);
        requireDraft(version);
        ValidatedGraph graph = validate(input, false);
        persistGraph(version.id(), graph);
        return loadGraph(requireVersion(templateId, versionId));
    }

    @Transactional
    public VersionGraph publish(AuthPrincipal principal, UUID templateId, UUID versionId) {
        authorization.requirePermission(principal, "inspection.create");
        InspectionTemplateRepository.VersionRow version = requireVersion(templateId, versionId);
        requireDraft(version);
        DraftGraphInput stored = toInput(loadGraph(version));
        validate(stored, true);
        repository.publishVersion(versionId, principal.userId(), Instant.now());
        return loadGraph(requireVersion(templateId, versionId));
    }

    @Transactional
    public VersionGraph createVersion(
            AuthPrincipal principal, UUID templateId, UUID sourceVersionId, NewVersionInput input) {
        authorization.requirePermission(principal, "inspection.create");
        if (!repository.lockTemplate(templateId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "Inspection template was not found.");
        }
        InspectionTemplateRepository.VersionRow source = requireVersion(templateId, sourceVersionId);
        if (!"PUBLISHED".equals(source.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "SOURCE_VERSION_NOT_PUBLISHED", "Create a new version from a published template version.");
        }
        if (repository.listVersions(templateId).stream().anyMatch(row -> "DRAFT".equals(row.status()))) {
            throw new ApiException(HttpStatus.CONFLICT, "DRAFT_VERSION_EXISTS", "Finish or publish the existing draft before creating another version.");
        }
        String changeSummary = text(input == null ? null : input.changeSummary(), "Change summary", 1000, false);
        int next = repository.nextVersionNumber(templateId);
        UUID newVersionId = UUID.randomUUID();
        repository.insertVersion(newVersionId, templateId, next, changeSummary, principal.userId());
        ValidatedGraph graph = validate(toInput(loadGraph(source)), false);
        persistGraph(newVersionId, graph);
        return loadGraph(requireVersion(templateId, newVersionId));
    }

    private void persistGraph(UUID versionId, ValidatedGraph graph) {
        repository.deleteDraftGraph(versionId);
        Map<String, UUID> questionIds = new HashMap<>();
        Map<String, UUID> conditionIds = new HashMap<>();

        for (ValidatedSection section : graph.sections()) {
            UUID sectionId = UUID.randomUUID();
            repository.insertSection(new InspectionTemplateRepository.SectionWrite(
                    sectionId, versionId, section.code(), section.title(), section.description(), section.sequenceNo()));
            for (ValidatedQuestion question : section.questions()) {
                UUID questionId = UUID.randomUUID();
                questionIds.put(question.code(), questionId);
                repository.insertQuestion(new InspectionTemplateRepository.QuestionWrite(
                        questionId, versionId, sectionId, question.code(), question.prompt(), question.helpText(),
                        question.questionType(), question.required(), question.sequenceNo()));
                for (ValidatedOption option : question.options()) {
                    repository.insertOption(new InspectionTemplateRepository.OptionWrite(
                            UUID.randomUUID(), versionId, questionId, option.value(), option.label(), option.sequenceNo()));
                }
            }
        }

        for (ValidatedCondition condition : graph.conditions()) {
            UUID conditionId = UUID.randomUUID();
            conditionIds.put(condition.code(), conditionId);
            repository.insertCondition(new InspectionTemplateRepository.ConditionWrite(
                    conditionId, versionId, condition.code(), questionIds.get(condition.sourceQuestionCode()),
                    condition.operator(), condition.comparisonValue(), questionIds.get(condition.targetQuestionCode()),
                    condition.showTarget(), condition.requireTargetAnswer(), condition.suggestFinding(), condition.sequenceNo()));
        }

        for (ValidatedEvidence evidence : graph.evidenceRequirements()) {
            repository.insertEvidenceRequirement(new InspectionTemplateRepository.EvidenceWrite(
                    UUID.randomUUID(), versionId, questionIds.get(evidence.questionCode()),
                    conditionIds.get(evidence.conditionCode()), evidence.evidenceType(), evidence.minCount(),
                    evidence.instructions(), evidence.sequenceNo()));
        }
    }

    private ValidatedGraph validate(DraftGraphInput input, boolean requirePublishable) {
        List<SectionInput> sections = input == null || input.sections() == null ? List.of() : input.sections();
        List<ConditionInput> conditions = input == null || input.conditions() == null ? List.of() : input.conditions();
        List<EvidenceRequirementInput> evidence = input == null || input.evidenceRequirements() == null
                ? List.of() : input.evidenceRequirements();
        if (sections.size() > 100) invalid("A template version cannot contain more than 100 sections.");

        Set<String> sectionCodes = new HashSet<>();
        Set<Integer> sectionOrder = new HashSet<>();
        Map<String, ValidatedQuestion> questions = new LinkedHashMap<>();
        List<ValidatedSection> validatedSections = new ArrayList<>();

        for (SectionInput rawSection : sections) {
            String sectionCode = normalizedCode(rawSection == null ? null : rawSection.code(), "Section code");
            if (!sectionCodes.add(sectionCode)) invalid("Section codes must be unique inside a version.");
            int sectionSequence = positive(rawSection.sequenceNo(), "Section sequence");
            if (!sectionOrder.add(sectionSequence)) invalid("Section sequence numbers must be unique inside a version.");
            String title = text(rawSection.title(), "Section title", 240, true);
            String description = text(rawSection.description(), "Section description", 1000, false);
            List<QuestionInput> rawQuestions = rawSection.questions() == null ? List.of() : rawSection.questions();
            if (rawQuestions.size() > 300) invalid("A section cannot contain more than 300 questions.");
            Set<Integer> questionOrder = new HashSet<>();
            List<ValidatedQuestion> sectionQuestions = new ArrayList<>();
            for (QuestionInput rawQuestion : rawQuestions) {
                ValidatedQuestion question = validateQuestion(rawQuestion, questionOrder);
                if (questions.putIfAbsent(question.code(), question) != null) {
                    invalid("Question codes must be unique across the entire template version.");
                }
                sectionQuestions.add(question);
            }
            validatedSections.add(new ValidatedSection(sectionCode, title, description, sectionSequence, sectionQuestions));
        }

        if (requirePublishable && (validatedSections.isEmpty() || questions.isEmpty())) {
            invalid("A published inspection template must contain at least one section and one question.");
        }
        if (conditions.size() > 1000 || evidence.size() > 1000) invalid("Template rule limits were exceeded.");

        Set<String> conditionCodes = new HashSet<>();
        Map<String, ValidatedCondition> conditionMap = new LinkedHashMap<>();
        Map<String, Set<Integer>> conditionOrder = new HashMap<>();
        for (ConditionInput raw : conditions) {
            ValidatedCondition condition = validateCondition(raw, questions);
            if (!conditionCodes.add(condition.code())) invalid("Condition codes must be unique inside a version.");
            if (!conditionOrder.computeIfAbsent(condition.sourceQuestionCode(), ignored -> new HashSet<>())
                    .add(condition.sequenceNo())) {
                invalid("Condition sequence numbers must be unique for each source question.");
            }
            conditionMap.put(condition.code(), condition);
        }

        List<ValidatedEvidence> validatedEvidence = new ArrayList<>();
        Map<String, Set<Integer>> evidenceOrder = new HashMap<>();
        Set<String> conditionsWithEvidence = new HashSet<>();
        for (EvidenceRequirementInput raw : evidence) {
            if (raw == null) invalid("Evidence requirement cannot be null.");
            String questionCode = normalizedCode(raw.questionCode(), "Evidence question code");
            if (!questions.containsKey(questionCode)) invalid("Evidence requirements must reference a question in the same version.");
            String conditionCode = blankToNull(raw.conditionCode());
            if (conditionCode != null) {
                conditionCode = normalizedCode(conditionCode, "Evidence condition code");
                if (!conditionMap.containsKey(conditionCode)) invalid("Evidence requirements must reference a condition in the same version.");
                conditionsWithEvidence.add(conditionCode);
            }
            String evidenceType = upper(raw.evidenceType());
            if (!EVIDENCE_TYPES.contains(evidenceType)) invalid("Unsupported evidence type.");
            int minCount = raw.minCount();
            if (minCount < 1 || minCount > 20) invalid("Evidence minimum count must be between 1 and 20.");
            int sequenceNo = positive(raw.sequenceNo(), "Evidence sequence");
            if (!evidenceOrder.computeIfAbsent(questionCode, ignored -> new HashSet<>()).add(sequenceNo)) {
                invalid("Evidence sequence numbers must be unique for each question.");
            }
            validatedEvidence.add(new ValidatedEvidence(
                    questionCode, conditionCode, evidenceType, minCount,
                    text(raw.instructions(), "Evidence instructions", 1000, false), sequenceNo));
        }

        for (ValidatedCondition condition : conditionMap.values()) {
            if (!condition.showTarget() && !condition.requireTargetAnswer() && !condition.suggestFinding()
                    && !conditionsWithEvidence.contains(condition.code())) {
                invalid("Every condition must have an answer/display/finding effect or activate an evidence requirement.");
            }
        }
        return new ValidatedGraph(validatedSections, List.copyOf(conditionMap.values()), validatedEvidence);
    }

    private ValidatedQuestion validateQuestion(QuestionInput raw, Set<Integer> order) {
        if (raw == null) invalid("Question cannot be null.");
        String code = normalizedCode(raw.code(), "Question code");
        String prompt = text(raw.prompt(), "Question prompt", 1000, true);
        String helpText = text(raw.helpText(), "Question help text", 1000, false);
        String type = upper(raw.questionType());
        if (!QUESTION_TYPES.contains(type)) invalid("Unsupported inspection question type.");
        int sequence = positive(raw.sequenceNo(), "Question sequence");
        if (!order.add(sequence)) invalid("Question sequence numbers must be unique inside a section.");
        List<OptionInput> rawOptions = raw.options() == null ? List.of() : raw.options();
        boolean select = "SINGLE_SELECT".equals(type) || "MULTI_SELECT".equals(type);
        if (!select && !rawOptions.isEmpty()) invalid("Only select questions may define options.");
        if (select && rawOptions.isEmpty()) invalid("Select questions require at least one option.");
        if (rawOptions.size() > 200) invalid("A question cannot contain more than 200 options.");
        Set<String> values = new HashSet<>();
        Set<Integer> optionOrder = new HashSet<>();
        List<ValidatedOption> options = new ArrayList<>();
        for (OptionInput option : rawOptions) {
            if (option == null) invalid("Question option cannot be null.");
            String value = normalizedOptionValue(option.value());
            if (!values.add(value)) invalid("Option values must be unique for a question.");
            int optionSequence = positive(option.sequenceNo(), "Option sequence");
            if (!optionOrder.add(optionSequence)) invalid("Option sequence numbers must be unique for a question.");
            options.add(new ValidatedOption(value, text(option.label(), "Option label", 240, true), optionSequence));
        }
        return new ValidatedQuestion(code, prompt, helpText, type, raw.required(), sequence, options);
    }

    private ValidatedCondition validateCondition(ConditionInput raw, Map<String, ValidatedQuestion> questions) {
        if (raw == null) invalid("Condition cannot be null.");
        String code = normalizedCode(raw.code(), "Condition code");
        String sourceCode = normalizedCode(raw.sourceQuestionCode(), "Condition source question code");
        ValidatedQuestion source = questions.get(sourceCode);
        if (source == null) invalid("Condition source must reference a question in the same version.");
        String targetCode = blankToNull(raw.targetQuestionCode());
        if (targetCode != null) {
            targetCode = normalizedCode(targetCode, "Condition target question code");
            if (!questions.containsKey(targetCode)) invalid("Condition target must reference a question in the same version.");
            if (sourceCode.equals(targetCode)) invalid("A condition cannot target its own source question.");
        }
        if ((raw.showTarget() || raw.requireTargetAnswer()) && targetCode == null) {
            invalid("Show/require-answer condition effects require a target question.");
        }
        String operator = upper(raw.operator());
        if (!CONDITION_OPERATORS.contains(operator)) invalid("Unsupported condition operator.");
        validateOperator(source.questionType(), operator);
        String comparison = normalizeComparison(source, operator, raw.comparisonValue());
        return new ValidatedCondition(
                code, sourceCode, operator, comparison, targetCode, raw.showTarget(),
                raw.requireTargetAnswer(), raw.suggestFinding(), positive(raw.sequenceNo(), "Condition sequence"));
    }

    private void validateOperator(String type, String operator) {
        if (Set.of("IS_EMPTY", "IS_NOT_EMPTY").contains(operator)) return;
        boolean allowed = switch (type) {
            case "YES_NO", "SINGLE_SELECT" -> Set.of("EQUALS", "NOT_EQUALS").contains(operator);
            case "TEXT", "LONG_TEXT" -> Set.of("EQUALS", "NOT_EQUALS", "CONTAINS", "NOT_CONTAINS").contains(operator);
            case "NUMBER", "DATE" -> Set.of(
                    "EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL").contains(operator);
            case "MULTI_SELECT" -> Set.of("CONTAINS", "NOT_CONTAINS").contains(operator);
            default -> false;
        };
        if (!allowed) invalid("The selected condition operator is not compatible with the source question type.");
    }

    private String normalizeComparison(ValidatedQuestion source, String operator, String raw) {
        if (Set.of("IS_EMPTY", "IS_NOT_EMPTY").contains(operator)) {
            if (raw != null && !raw.isBlank()) invalid("Empty/not-empty conditions cannot include a comparison value.");
            return null;
        }
        String value = text(raw, "Condition comparison value", 240, true);
        switch (source.questionType()) {
            case "YES_NO" -> {
                value = value.toUpperCase(Locale.ROOT);
                if (!Set.of("YES", "NO").contains(value)) invalid("YES_NO conditions must compare against YES or NO.");
            }
            case "SINGLE_SELECT", "MULTI_SELECT" -> {
                value = value.toUpperCase(Locale.ROOT);
                String finalValue = value;
                if (source.options().stream().noneMatch(option -> option.value().equals(finalValue))) {
                    invalid("Select conditions must compare against an option value defined on the source question.");
                }
            }
            case "NUMBER" -> {
                try {
                    new BigDecimal(value);
                } catch (NumberFormatException exception) {
                    invalid("Number conditions require a numeric comparison value.");
                }
            }
            case "DATE" -> {
                try {
                    LocalDate.parse(value);
                } catch (DateTimeParseException exception) {
                    invalid("Date conditions require an ISO date comparison value (YYYY-MM-DD).");
                }
            }
            default -> {
                // Text comparison is intentionally preserved after trimming.
            }
        }
        return value;
    }

    private VersionGraph loadGraph(InspectionTemplateRepository.VersionRow version) {
        List<InspectionTemplateRepository.SectionRow> sectionRows = repository.listSections(version.id());
        List<InspectionTemplateRepository.QuestionRow> questionRows = repository.listQuestions(version.id());
        List<InspectionTemplateRepository.OptionRow> optionRows = repository.listOptions(version.id());
        Map<UUID, List<InspectionTemplateRepository.OptionRow>> options = new HashMap<>();
        for (InspectionTemplateRepository.OptionRow row : optionRows) {
            options.computeIfAbsent(row.questionId(), ignored -> new ArrayList<>()).add(row);
        }
        Map<UUID, List<QuestionView>> questions = new HashMap<>();
        for (InspectionTemplateRepository.QuestionRow row : questionRows) {
            questions.computeIfAbsent(row.sectionId(), ignored -> new ArrayList<>()).add(new QuestionView(
                    row.id(), row.code(), row.prompt(), row.helpText(), row.questionType(), row.required(),
                    row.sequenceNo(), options.getOrDefault(row.id(), List.of()).stream()
                            .map(option -> new OptionView(option.id(), option.value(), option.label(), option.sequenceNo())).toList()));
        }
        List<SectionView> sections = sectionRows.stream().map(row -> new SectionView(
                row.id(), row.code(), row.title(), row.description(), row.sequenceNo(),
                questions.getOrDefault(row.id(), List.of()))).toList();
        List<ConditionView> conditions = repository.listConditions(version.id()).stream().map(row -> new ConditionView(
                row.id(), row.code(), row.sourceQuestionCode(), row.operator(), row.comparisonValue(),
                row.targetQuestionCode(), row.showTarget(), row.requireTargetAnswer(), row.suggestFinding(), row.sequenceNo())).toList();
        List<EvidenceRequirementView> evidence = repository.listEvidenceRequirements(version.id()).stream().map(row ->
                new EvidenceRequirementView(row.id(), row.questionCode(), row.conditionCode(), row.evidenceType(),
                        row.minCount(), row.instructions(), row.sequenceNo())).toList();
        return new VersionGraph(summary(version), sections, conditions, evidence);
    }

    private DraftGraphInput toInput(VersionGraph graph) {
        List<SectionInput> sections = graph.sections().stream().map(section -> new SectionInput(
                section.code(), section.title(), section.description(), section.sequenceNo(),
                section.questions().stream().map(question -> new QuestionInput(
                        question.code(), question.prompt(), question.helpText(), question.questionType(), question.required(),
                        question.sequenceNo(), question.options().stream().map(option ->
                                new OptionInput(option.value(), option.label(), option.sequenceNo())).toList())).toList())).toList();
        List<ConditionInput> conditions = graph.conditions().stream().map(condition -> new ConditionInput(
                condition.code(), condition.sourceQuestionCode(), condition.operator(), condition.comparisonValue(),
                condition.targetQuestionCode(), condition.showTarget(), condition.requireTargetAnswer(),
                condition.suggestFinding(), condition.sequenceNo())).toList();
        List<EvidenceRequirementInput> evidence = graph.evidenceRequirements().stream().map(item ->
                new EvidenceRequirementInput(item.questionCode(), item.conditionCode(), item.evidenceType(), item.minCount(),
                        item.instructions(), item.sequenceNo())).toList();
        return new DraftGraphInput(sections, conditions, evidence);
    }

    private InspectionTemplateRepository.TemplateRow requireTemplate(UUID templateId) {
        if (templateId == null) throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "Inspection template was not found.");
        return repository.findTemplate(templateId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "Inspection template was not found."));
    }

    private InspectionTemplateRepository.VersionRow requireVersion(UUID templateId, UUID versionId) {
        requireTemplate(templateId);
        return repository.findVersion(templateId, versionId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_VERSION_NOT_FOUND", "Inspection template version was not found."));
    }

    private static void requireDraft(InspectionTemplateRepository.VersionRow version) {
        if (!"DRAFT".equals(version.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "TEMPLATE_VERSION_IMMUTABLE", "Published inspection template versions are immutable. Create a new version to make changes.");
        }
    }

    private boolean canAuthor(AuthPrincipal principal) {
        return authorization.current(principal).effectivePermissions().contains("inspection.create");
    }

    private TemplateSummary summary(InspectionTemplateRepository.TemplateRow row, boolean author) {
        return new TemplateSummary(row.id(), row.code(), row.name(), row.description(), row.latestPublishedVersion(),
                author ? row.draftVersion() : null, row.createdAt(), row.updatedAt());
    }

    private VersionSummary summary(InspectionTemplateRepository.VersionRow row) {
        return new VersionSummary(row.id(), row.versionNo(), row.status(), row.changeSummary(), row.publishedAt(), row.createdAt(), row.updatedAt());
    }

    private static String normalizeSearch(String query) {
        if (query == null || query.isBlank()) return null;
        String value = query.trim().toLowerCase(Locale.ROOT);
        if (value.length() > 160) invalid("Search query must not exceed 160 characters.");
        return "%" + value + "%";
    }

    private static String normalizedCode(String raw, String label) {
        String value = text(raw, label, 64, true).toUpperCase(Locale.ROOT);
        if (!CODE.matcher(value).matches()) invalid(label + " must use 2–64 uppercase letters, numbers, dots, slashes, underscores or hyphens.");
        return value;
    }

    private static String normalizedOptionValue(String raw) {
        String value = text(raw, "Option value", 96, true).toUpperCase(Locale.ROOT);
        if (!OPTION_VALUE.matcher(value).matches()) invalid("Option value must use uppercase letters, numbers, dots, slashes, underscores or hyphens.");
        return value;
    }

    private static String upper(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
    }

    private static String blankToNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return raw.trim();
    }

    private static String text(String raw, String label, int max, boolean required) {
        if (raw == null || raw.isBlank()) {
            if (required) invalid(label + " is required.");
            return null;
        }
        String value = raw.trim();
        if (value.length() > max) invalid(label + " must not exceed " + max + " characters.");
        return value;
    }

    private static int positive(int value, String label) {
        if (value <= 0) invalid(label + " must be greater than zero.");
        return value;
    }

    private static void invalid(String message) {
        throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TEMPLATE_GRAPH", message);
    }

    public record PageView<T>(List<T> items, long total, int page, int size, int totalPages) {}
    public record TemplateSummary(
            UUID id, String code, String name, String description, Integer latestPublishedVersion,
            Integer draftVersion, Instant createdAt, Instant updatedAt) {}
    public record VersionSummary(
            UUID id, int versionNo, String status, String changeSummary, Instant publishedAt,
            Instant createdAt, Instant updatedAt) {}
    public record TemplateDetail(TemplateSummary template, List<VersionSummary> versions, boolean canAuthor) {}
    public record VersionGraph(
            VersionSummary version, List<SectionView> sections, List<ConditionView> conditions,
            List<EvidenceRequirementView> evidenceRequirements) {}
    public record SectionView(
            UUID id, String code, String title, String description, int sequenceNo, List<QuestionView> questions) {}
    public record QuestionView(
            UUID id, String code, String prompt, String helpText, String questionType,
            boolean required, int sequenceNo, List<OptionView> options) {}
    public record OptionView(UUID id, String value, String label, int sequenceNo) {}
    public record ConditionView(
            UUID id, String code, String sourceQuestionCode, String operator, String comparisonValue,
            String targetQuestionCode, boolean showTarget, boolean requireTargetAnswer,
            boolean suggestFinding, int sequenceNo) {}
    public record EvidenceRequirementView(
            UUID id, String questionCode, String conditionCode, String evidenceType,
            int minCount, String instructions, int sequenceNo) {}

    public record TemplateCreateInput(String code, String name, String description) {}
    public record NewVersionInput(String changeSummary) {}
    public record DraftGraphInput(
            List<SectionInput> sections, List<ConditionInput> conditions,
            List<EvidenceRequirementInput> evidenceRequirements) {}
    public record SectionInput(
            String code, String title, String description, int sequenceNo, List<QuestionInput> questions) {}
    public record QuestionInput(
            String code, String prompt, String helpText, String questionType,
            boolean required, int sequenceNo, List<OptionInput> options) {}
    public record OptionInput(String value, String label, int sequenceNo) {}
    public record ConditionInput(
            String code, String sourceQuestionCode, String operator, String comparisonValue,
            String targetQuestionCode, boolean showTarget, boolean requireTargetAnswer,
            boolean suggestFinding, int sequenceNo) {}
    public record EvidenceRequirementInput(
            String questionCode, String conditionCode, String evidenceType,
            int minCount, String instructions, int sequenceNo) {}

    private record ValidatedGraph(
            List<ValidatedSection> sections, List<ValidatedCondition> conditions,
            List<ValidatedEvidence> evidenceRequirements) {}
    private record ValidatedSection(
            String code, String title, String description, int sequenceNo, List<ValidatedQuestion> questions) {}
    private record ValidatedQuestion(
            String code, String prompt, String helpText, String questionType,
            boolean required, int sequenceNo, List<ValidatedOption> options) {}
    private record ValidatedOption(String value, String label, int sequenceNo) {}
    private record ValidatedCondition(
            String code, String sourceQuestionCode, String operator, String comparisonValue,
            String targetQuestionCode, boolean showTarget, boolean requireTargetAnswer,
            boolean suggestFinding, int sequenceNo) {}
    private record ValidatedEvidence(
            String questionCode, String conditionCode, String evidenceType,
            int minCount, String instructions, int sequenceNo) {}
}