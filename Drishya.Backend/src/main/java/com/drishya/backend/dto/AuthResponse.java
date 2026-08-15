package com.drishya.backend.dto;

/** What the login endpoints return: the account plus a bearer token. */
public record AuthResponse(
        UserDto user,
        String token) {}
