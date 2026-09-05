package org.nirikshanx;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class NirikshanApplication {
    public static void main(String[] args) {
        SpringApplication.run(NirikshanApplication.class, args);
    }
}
