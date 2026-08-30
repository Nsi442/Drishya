package com.drishya.backend.service.validation;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.ValidationFailure;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * The purchase order reference must exist, be correctly formed, and be the one
 * this consignment was actually booked against.
 *
 * <p>A mismatched PO is the single most expensive documentation error in
 * marketplace inbound, because it does not look like an error. The vehicle
 * arrives, the goods are real, the paperwork is present — and the receiving
 * system books them against a different order, or none. That reconciles weeks
 * later as a short delivery on one PO and an unexpected one on another, by
 * which time the vehicle, the driver and the pallet are long gone.
 */
@Component
@Order(10)
public class PoReferenceValidator implements AsnValidator {

    /**
     * The house format: PO- followed by six digits. Deliberately strict. A
     * reference that is merely close enough for a human to read is not close
     * enough for a receiving system to match on.
     */
    private static final Pattern PO_FORMAT = Pattern.compile("^PO-\\d{6}$");

    @Override
    public List<ValidationFailure> validate(AsnSubmission asn, Shipment shipment) {
        List<ValidationFailure> failures = new ArrayList<>();
        String submitted = asn.poReference() == null ? "" : asn.poReference().trim();

        if (submitted.isEmpty()) {
            failures.add(ValidationFailure.blocking(
                    "PO_MISSING", "poReference",
                    "The purchase order reference is missing. The fulfilment centre cannot "
                            + "book goods in without it.",
                    shipment.getReference(), "(empty)"));
            return failures;
        }

        if (!PO_FORMAT.matcher(submitted).matches()) {
            failures.add(ValidationFailure.blocking(
                    "PO_FORMAT", "poReference",
                    "The purchase order reference is not in the expected format. "
                            + "It should look like PO-123456.",
                    "PO-nnnnnn", submitted));
        }

        // Checked separately from the format so a vendor with a well-formed but
        // wrong reference is told that, rather than being told it looks fine.
        if (shipment.getReference() != null && !shipment.getReference().equals(submitted)) {
            failures.add(ValidationFailure.blocking(
                    "PO_MISMATCH", "poReference",
                    "This purchase order reference does not match the one this consignment "
                            + "was booked against. Sending it will book the goods to the wrong "
                            + "order.",
                    shipment.getReference(), submitted));
        }

        return failures;
    }
}
