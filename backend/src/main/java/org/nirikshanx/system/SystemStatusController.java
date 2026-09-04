package org.nirikshanx.system;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
public class SystemStatusController {
    private final SystemStatusService service;

    public SystemStatusController(SystemStatusService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public ResponseEntity<SystemStatusResponse> status() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.readStatus());
    }
}
