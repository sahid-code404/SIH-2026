package org.nirikshanx.system;

import java.util.Map;

public record SystemStatusResponse(
        String service,
        String status,
        Map<String, ComponentStatus> components
) {
    public record ComponentStatus(String status) {}
}
