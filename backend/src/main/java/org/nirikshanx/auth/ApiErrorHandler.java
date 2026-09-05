package org.nirikshanx.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrorHandler {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiError> handleApiException(ApiException exception, HttpServletRequest request) {
        return ResponseEntity.status(exception.status())
                .body(new ApiError(
                        exception.type(),
                        exception.getMessage(),
                        exception.status().value(),
                        requestId(request),
                        List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception, HttpServletRequest request) {
        List<FieldError> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldError(error.getField(), "INVALID_VALUE", error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest().body(new ApiError(
                "VALIDATION_ERROR",
                "Request validation failed",
                HttpStatus.BAD_REQUEST.value(),
                requestId(request),
                errors));
    }

    private static String requestId(HttpServletRequest request) {
        Object value = request.getAttribute(RequestIdFilter.ATTRIBUTE);
        return value == null ? "unknown" : value.toString();
    }

    public record ApiError(String type, String title, int status, String requestId, List<FieldError> errors) {
    }

    public record FieldError(String field, String code, String message) {
    }
}
