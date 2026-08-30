package com.drishya.backend.domain.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;

/**
 * The coarse calendar bucket lane speeds and dock turnarounds are averaged
 * within. A Tuesday afternoon on NH-48 and a Sunday afternoon on the same
 * stretch are different roads, and averaging them together produces a number
 * that describes neither.
 *
 * <p>Two buckets rather than seven deliberately: with a cluster this size,
 * splitting by weekday would leave most cells with too few samples to mean
 * anything. Widen this when sample counts justify it, not before.
 */
public enum DayType {

    WEEKDAY("weekday"),
    WEEKEND("weekend");

    private final String wire;

    DayType(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    /** Which bucket an instant falls in, in the given zone. */
    public static DayType of(Instant instant, ZoneId zone) {
        DayOfWeek day = instant.atZone(zone).getDayOfWeek();
        return (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) ? WEEKEND : WEEKDAY;
    }

    @JsonCreator
    public static DayType from(String value) {
        if (value == null) {
            return null;
        }
        for (DayType candidate : values()) {
            if (candidate.wire.equalsIgnoreCase(value) || candidate.name().equalsIgnoreCase(value)) {
                return candidate;
            }
        }
        throw new IllegalArgumentException("Unknown DayType: " + value);
    }
}
