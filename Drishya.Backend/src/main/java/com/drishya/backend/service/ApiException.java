package com.drishya.backend.service;

import org.springframework.http.HttpStatus;

/**
 * An error with a status, a machine-readable code and a message meant for a
 * person to read. The frontend shows {@code message} verbatim in its error
 * states, so it is written accordingly.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    /** A dock clash, a duplicate account — the request was well-formed but cannot stand. */
    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, "CONFLICT", message);
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", message);
    }

    /**
     * Authenticated, but not allowed — a driver reaching a vendor endpoint, or
     * an account with no tenant asking a tenant-scoped question.
     *
     * <p>Not for "this belongs to another tenant": that answers as 404, because
     * a 403 on a specific id already confirms the id exists.
     */
    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
