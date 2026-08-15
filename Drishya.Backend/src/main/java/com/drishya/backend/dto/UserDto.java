package com.drishya.backend.dto;

import com.drishya.backend.domain.enums.Role;

/** The signed-in account. Never carries the password hash. */
public record UserDto(
        String id,
        String email,
        String name,
        Role role,
        String title,
        String orgId,
        String orgName,
        String phone,
        String initials,
        String driverId,
        String language) {}
