package com.drishya.backend.web;

import com.drishya.backend.service.ApiException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns exceptions into a consistent error body.
 *
 * <p>The frontend renders {@code message} directly in its error states, so these
 * are written for a person to read — "That email and password combination is not
 * recognised", not "BadCredentialsException".
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus()).body(body(ex.getStatus(), ex.getCode(), ex.getMessage()));
    }

    /** Bean-validation failures, reported field by field. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining("; "));

        Map<String, Object> payload = body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                message.isBlank() ? "The request body is not valid." : message);
        payload.put("fields", ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        error -> error.getField(),
                        error -> error.getDefaultMessage() == null ? "Invalid" : error.getDefaultMessage(),
                        (a, b) -> a)));
        return ResponseEntity.badRequest().body(payload);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest()
                .body(body(HttpStatus.BAD_REQUEST, "BAD_REQUEST", ex.getMessage()));
    }

    /**
     * A body the parser could not read at all — a missing field mapped to a
     * primitive, a malformed number, wrong JSON shape.
     *
     * <p>Without this it fell to the catch-all and became a 500, which says the
     * server broke when in fact the request was wrong. That matters beyond
     * tidiness: a 500 tells a caller to retry, and this will fail identically
     * every time. It also masked a security test — a cross-tenant write attempt
     * with a malformed body returned 500, which read as "not blocked" when the
     * request had simply never reached the ownership check.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(body(HttpStatus.BAD_REQUEST, "MALFORMED_BODY",
                        "That request body could not be read. Check the field types and that "
                                + "every required field is present."));
    }

    /**
     * The catch-all. Logs the stack trace but does not return it — an internal
     * error message is for the operator, not the browser.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                        "Something went wrong on the server."));
    }

    private Map<String, Object> body(HttpStatus status, String code, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("timestamp", Instant.now().toEpochMilli());
        payload.put("status", status.value());
        payload.put("code", code);
        payload.put("message", message);
        return payload;
    }
}
