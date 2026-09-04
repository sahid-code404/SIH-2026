package org.nirikshanx.system;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class SystemStatusResponseTest {
    @Test
    void exposesComponentStateWithoutInfrastructureDetails() {
        var response = new SystemStatusResponse(
                "nirikshanx-backend",
                "UP",
                Map.of(
                        "database", new SystemStatusResponse.ComponentStatus("UP"),
                        "redis", new SystemStatusResponse.ComponentStatus("UP")
                )
        );

        assertThat(response.status()).isEqualTo("UP");
        assertThat(response.components()).containsOnlyKeys("database", "redis");
    }
}
