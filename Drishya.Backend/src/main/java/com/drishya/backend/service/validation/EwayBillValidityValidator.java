package com.drishya.backend.service.validation;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.ValidationFailure;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * The e-way bill has to still be valid when the vehicle actually arrives, not
 * merely when it leaves.
 *
 * <p>This is the check that could only exist in a system that predicts arrival
 * times. Every other validator here compares two fields; this one compares a
 * document against where the platform believes the vehicle will be, and when.
 *
 * <p>An e-way bill that expires mid-journey is a genuinely nasty failure: the
 * consignment is legal at dispatch, illegal on arrival, and the driver is the
 * one standing at the gate. Catching it before the wheels turn is worth more
 * than every format check in this package put together.
 */
@Component
@Order(40)
public class EwayBillValidityValidator implements AsnValidator {

    /**
     * Below this much slack at the predicted arrival, warn. A bill with an hour
     * to spare is technically fine and one traffic jam from not being.
     */
    private static final Duration COMFORTABLE_MARGIN = Duration.ofHours(4);

    @Override
    public List<ValidationFailure> validate(AsnSubmission asn, Shipment shipment) {
        List<ValidationFailure> failures = new ArrayList<>();

        if (asn.ewayBillExpiresAt() == null) {
            // Not blocking on its own — MandatoryFieldValidator already requires
            // the number, and a vendor who has not recorded an expiry has a data
            // gap rather than an illegal consignment.
            failures.add(ValidationFailure.advisory(
                    "EWAY_EXPIRY_UNKNOWN", "ewayBillExpiresAt",
                    "No expiry recorded for the e-way bill, so it cannot be checked against "
                            + "the predicted arrival.",
                    "an expiry timestamp", "(none)"));
            return failures;
        }

        Instant expiry = Instant.ofEpochMilli(asn.ewayBillExpiresAt());
        Instant now = Instant.now();

        if (expiry.isBefore(now)) {
            failures.add(ValidationFailure.blocking(
                    "EWAY_EXPIRED", "ewayBillExpiresAt",
                    "The e-way bill has already expired. Regenerate it before dispatch.",
                    "later than now", expiry.toString()));
            return failures;
        }

        // What the platform currently believes about arrival. predictedAt is
        // maintained by the ETA engine; slotEnd is what was agreed at booking.
        Instant arrival = shipment.getPredictedAt() != null
                ? shipment.getPredictedAt()
                : shipment.getSlotEnd();

        if (arrival == null) {
            return failures;
        }

        if (expiry.isBefore(arrival)) {
            failures.add(ValidationFailure.blocking(
                    "EWAY_EXPIRES_IN_TRANSIT", "ewayBillExpiresAt",
                    "The e-way bill expires before this consignment is predicted to reach a "
                            + "bay. It is legal to dispatch and will not be legal on arrival — "
                            + "extend it now rather than at the gate.",
                    "later than " + arrival, expiry.toString()));
            return failures;
        }

        Duration margin = Duration.between(arrival, expiry);
        if (margin.compareTo(COMFORTABLE_MARGIN) < 0) {
            failures.add(ValidationFailure.advisory(
                    "EWAY_TIGHT", "ewayBillExpiresAt",
                    "The e-way bill expires only " + margin.toHours() + "h after the predicted "
                            + "arrival. One delay on the lane and it will not be valid at the "
                            + "gate.",
                    "at least " + COMFORTABLE_MARGIN.toHours() + "h of margin",
                    margin.toHours() + "h"));
        }

        return failures;
    }
}
