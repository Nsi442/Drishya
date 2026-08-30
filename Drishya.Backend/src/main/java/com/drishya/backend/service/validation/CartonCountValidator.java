package com.drishya.backend.service.validation;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.dto.AsnDtos.AsnLine;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.ValidationFailure;
import java.util.ArrayList;
import java.util.List;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * The declared carton count must match the booking, and the line items must add
 * up to it.
 *
 * <p>Two separate checks that are easy to conflate. The first catches a vendor
 * sending a different quantity than was agreed. The second catches an internally
 * inconsistent notice — lines totalling 47 with a header saying 50 — which is
 * worse, because whichever number the receiving system happens to read, the
 * other one is the discrepancy that gets raised at the bay.
 */
@Component
@Order(20)
public class CartonCountValidator implements AsnValidator {

    @Override
    public List<ValidationFailure> validate(AsnSubmission asn, Shipment shipment) {
        List<ValidationFailure> failures = new ArrayList<>();
        Integer declared = asn.declaredCartons();

        if (declared == null || declared <= 0) {
            failures.add(ValidationFailure.blocking(
                    "CARTONS_MISSING", "declaredCartons",
                    "Declare how many cartons are on the vehicle.",
                    shipment.getCartons(), declared));
            return failures;
        }

        if (shipment.getCartons() > 0 && declared != shipment.getCartons()) {
            failures.add(ValidationFailure.blocking(
                    "CARTONS_MISMATCH", "declaredCartons",
                    "The declared carton count does not match the booking. The receiving desk "
                            + "will count what arrives and raise the difference as a shortage "
                            + "or an overage against you.",
                    shipment.getCartons(), declared));
        }

        // Internal consistency of the notice itself.
        if (asn.lines() != null && !asn.lines().isEmpty()) {
            int lineTotal = asn.lines().stream()
                    .map(AsnLine::cartons)
                    .filter(c -> c != null)
                    .mapToInt(Integer::intValue)
                    .sum();

            if (lineTotal != declared) {
                failures.add(ValidationFailure.blocking(
                        "CARTONS_LINE_SUM", "lines",
                        "The line items do not add up to the declared total. The notice "
                                + "contradicts itself, and whichever figure the fulfilment "
                                + "centre reads, the other becomes a discrepancy at the bay.",
                        declared, lineTotal));
            }

            asn.lines().stream()
                    .filter(l -> l.sku() == null || l.sku().isBlank())
                    .findFirst()
                    .ifPresent(l -> failures.add(ValidationFailure.blocking(
                            "LINE_SKU_MISSING", "lines",
                            "Every line must carry a SKU. A line without one cannot be "
                                    + "received against the order.",
                            "a SKU on every line", "(blank)")));
        }

        // Weight is advisory: vendors legitimately estimate it, and a wrong
        // estimate does not stop goods being received. A wildly wrong one is
        // still worth mentioning, because it usually means a units mistake.
        if (asn.declaredWeightKg() != null && shipment.getWeightKg() > 0) {
            double ratio = (double) asn.declaredWeightKg() / shipment.getWeightKg();
            if (ratio < 0.5 || ratio > 2.0) {
                failures.add(ValidationFailure.advisory(
                        "WEIGHT_IMPLAUSIBLE", "declaredWeightKg",
                        "The declared weight is a long way from the booked weight. Check the "
                                + "units before the vehicle is loaded.",
                        shipment.getWeightKg() + " kg", asn.declaredWeightKg() + " kg"));
            }
        }

        return failures;
    }
}
