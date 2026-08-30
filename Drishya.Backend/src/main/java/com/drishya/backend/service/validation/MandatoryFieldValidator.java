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
 * The paperwork that has to be physically present at the gate.
 *
 * <p>These are not the platform's rules. A tax invoice and an e-way bill are
 * statutory for interstate movement above the threshold, and a seal number is
 * what lets anyone argue afterwards that a consignment was not opened in
 * transit. A vehicle arriving without them is turned away at the gate having
 * driven the whole way — which is exactly the outcome this endpoint exists to
 * prevent, and why every one of these is BLOCKING rather than advisory.
 */
@Component
@Order(30)
public class MandatoryFieldValidator implements AsnValidator {

    /**
     * A GST tax invoice number: at most 16 characters, alphanumerics plus slash
     * and hyphen.
     *
     * <p>Taken from the actual rule rather than invented. Indian invoice numbers
     * routinely look like INV/26-27/4200 — a financial year and a serial — and
     * an earlier version of this pattern demanded a leading "INV-", which
     * rejected every genuinely valid invoice in the system. A format check
     * stricter than the standard it claims to enforce is worse than none: it
     * blocks correct paperwork and teaches vendors to distrust the validator.
     */
    private static final Pattern GST_INVOICE = Pattern.compile("^[A-Za-z0-9/-]{1,16}$");

    /** E-way bills are a 12-digit number. */
    private static final Pattern EWAY_FORMAT = Pattern.compile("^\\d{12}$");

    /** Seals are alphanumeric, 6 to 16 characters, no spaces. */
    private static final Pattern SEAL_FORMAT = Pattern.compile("^[A-Z0-9]{6,16}$");

    @Override
    public List<ValidationFailure> validate(AsnSubmission asn, Shipment shipment) {
        List<ValidationFailure> failures = new ArrayList<>();

        required(failures, asn.invoiceNumber(), "invoiceNumber", "INVOICE_MISSING",
                "The tax invoice number is required. The vehicle will not be admitted "
                        + "without it.");
        required(failures, asn.ewayBillNumber(), "ewayBillNumber", "EWAY_MISSING",
                "The e-way bill number is required for this movement.");
        required(failures, asn.sealNumber(), "sealNumber", "SEAL_MISSING",
                "The seal number is required. Without it there is no way to show the "
                        + "consignment was not opened in transit.");

        format(failures, asn.invoiceNumber(), GST_INVOICE, "invoiceNumber",
                "INVOICE_FORMAT", "up to 16 characters, letters digits / and -",
                "The invoice number is not in the expected format.");
        format(failures, asn.ewayBillNumber(), EWAY_FORMAT, "ewayBillNumber",
                "EWAY_FORMAT", "12 digits",
                "An e-way bill number is exactly 12 digits.");
        format(failures, asn.sealNumber(), SEAL_FORMAT, "sealNumber",
                "SEAL_FORMAT", "6 to 16 uppercase letters and digits",
                "The seal number is not in the expected format.");

        // If the booking already recorded an invoice number, the notice must
        // agree with it. Two different numbers for one consignment is precisely
        // the ambiguity a chargeback is argued over.
        if (notBlank(asn.invoiceNumber()) && notBlank(shipment.getInvoiceNo())
                && !shipment.getInvoiceNo().equals(asn.invoiceNumber().trim())) {
            failures.add(ValidationFailure.blocking(
                    "INVOICE_MISMATCH", "invoiceNumber",
                    "This invoice number differs from the one recorded against the booking.",
                    shipment.getInvoiceNo(), asn.invoiceNumber()));
        }

        return failures;
    }

    private void required(List<ValidationFailure> failures, String value, String field,
                          String code, String message) {
        if (!notBlank(value)) {
            failures.add(ValidationFailure.blocking(code, field, message, "required", "(empty)"));
        }
    }

    /** Only checks shape when a value is present; absence is the other check's job. */
    private void format(List<ValidationFailure> failures, String value, Pattern pattern,
                        String field, String code, String expected, String message) {
        if (notBlank(value) && !pattern.matcher(value.trim()).matches()) {
            failures.add(ValidationFailure.blocking(code, field, message, expected, value));
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
