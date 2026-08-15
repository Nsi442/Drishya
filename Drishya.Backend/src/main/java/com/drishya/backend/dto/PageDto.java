package com.drishya.backend.dto;

import java.util.List;

/**
 * A page of results, in the exact shape the frontend's table components already
 * expect: {@code { rows, total, page, pageSize, pageCount }}.
 *
 * <p>Deliberately not Spring's {@code Page} — that serialises a large envelope
 * of pageable metadata the UI has no use for, and its field names would force a
 * change in every table.
 */
public record PageDto<T>(List<T> rows, long total, int page, int pageSize, int pageCount) {

    /** Slices an already-filtered, already-sorted list. */
    public static <T> PageDto<T> of(List<T> all, int page, int pageSize) {
        int size = Math.max(1, pageSize);
        int total = all.size();
        int pageCount = Math.max(1, (int) Math.ceil(total / (double) size));
        int safePage = Math.min(Math.max(page, 1), pageCount);
        int from = (safePage - 1) * size;
        int to = Math.min(from + size, total);
        List<T> rows = from >= total ? List.of() : all.subList(from, to);
        return new PageDto<>(rows, total, safePage, size, pageCount);
    }
}
