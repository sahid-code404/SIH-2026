package org.nirikshanx.system;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SystemStatusService {
    private final JdbcTemplate jdbcTemplate;
    private final RedisConnectionFactory redisConnectionFactory;

    public SystemStatusService(JdbcTemplate jdbcTemplate, RedisConnectionFactory redisConnectionFactory) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisConnectionFactory = redisConnectionFactory;
    }

    public SystemStatusResponse readStatus() {
        boolean databaseUp = databaseUp();
        boolean redisUp = redisUp();

        Map<String, SystemStatusResponse.ComponentStatus> components = new LinkedHashMap<>();
        components.put("database", new SystemStatusResponse.ComponentStatus(databaseUp ? "UP" : "DOWN"));
        components.put("redis", new SystemStatusResponse.ComponentStatus(redisUp ? "UP" : "DOWN"));

        return new SystemStatusResponse(
                "nirikshanx-backend",
                databaseUp && redisUp ? "UP" : "DEGRADED",
                Map.copyOf(components)
        );
    }

    private boolean databaseUp() {
        try {
            Integer value = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            return Integer.valueOf(1).equals(value);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean redisUp() {
        RedisConnection connection = null;
        try {
            connection = redisConnectionFactory.getConnection();
            return "PONG".equalsIgnoreCase(connection.ping());
        } catch (RuntimeException ignored) {
            return false;
        } finally {
            if (connection != null) connection.close();
        }
    }
}
