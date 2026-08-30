package com.drishya.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

/**
 * Advance shipping notice, on the wire.
 *
 * <p><b>The timing is the feature.</b> This is submitted before the vehicle
 * leaves, and the failures come back before the vehicle leaves. Catching a
 * carton-count mismatch at the origin warehouse costs a re-count and a re-print;
 * catching it after a four-hour run to the fulfilment centre costs a refused
 * delivery, a return leg, and a chargeback that surfaces weeks later on a
 * payment statement with the dispute window already closing.
 *
 * <p>Everything else in this file exists to make that refusal <i>useful</i> — a
 * boolean would tell a vendor their paperwork is wrong without telling them
 * which field, what was expected, or what to do about it.
 */
public final class AsnDtos {

    private AsnDtos() {
    }

    /** What the vendor declares they are sending. */
    public record AsnSubmission(
            @NotNull(message = "The purchase order reference is required.")
            String poReference,

            @NotNull(message = "Declare how many cartons are on the vehicle.")
            @Positive(message = "A consignment must have at least one carton.")
            Integer declaredCartons,

            Integer declaredWeightKg,
            String invoiceNumber,
            String ewayBillNumber,
            String sealNumber,

            /** Epoch millis. An e-way bill valid now may not be at the slot. */
            Long ewayBillExpiresAt,

            List<AsnLine> lines) {
    }

    /** One SKU on the notice. */
    public record AsnLine(String sku, String description, Integer cartons) {
    }

    /**
     * One thing that is wrong, in terms the vendor can act on.
     *
     * @param field which input to go and look at
     * @param expected what the platform believes, from the booking
     * @param actual what the submission said
     * @param severity BLOCKING stops dispatch; ADVISORY does not
     */
    public record ValidationFailure(
            String code,
            String field,
            String message,
            String expected,
            String actual,
            Severity severity) {

        public enum Severity {
            /** Dispatch is refused until this is resolved. */
            BLOCKING,
            /**
             * Worth knowing, not worth stopping a vehicle for. A borderline
             * e-way bill is the common case: still valid, but tight enough that
             * a delay would invalidate it.
             */
            ADVISORY
        }

        public static ValidationFailure blocking(String code, String field, String message,
                                                 Object expected, Object actual) {
            return new ValidationFailure(code, field, message,
                    String.valueOf(expected), String.valueOf(actual), Severity.BLOCKING);
        }

        public static ValidationFailure advisory(String code, String field, String message,
                                                 Object expected, Object actual) {
            return new ValidationFailure(code, field, message,
                    String.valueOf(expected), String.valueOf(actual), Severity.ADVISORY);
        }
    }

    /**
     * The answer.
     *
     * @param dispatchAllowed the only field a caller needs to branch on, but
     *     never the only one it should show
     */
    public record AsnValidationResult(
            String shipmentId,
            boolean dispatchAllowed,
            int checksRun,
            List<ValidationFailure> failures,
            long validatedAt) {

        public boolean hasBlocking() {
            return failures.stream()
                    .anyMatch(f -> f.severity() == ValidationFailure.Severity.BLOCKING);
        }
    }
}
