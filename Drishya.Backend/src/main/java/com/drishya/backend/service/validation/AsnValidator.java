package com.drishya.backend.service.validation;

import com.drishya.backend.domain.Shipment;
import com.drishya.backend.dto.AsnDtos.AsnSubmission;
import com.drishya.backend.dto.AsnDtos.ValidationFailure;

import java.util.List;

/**
 * One check over a submitted advance shipping notice.
 *
 * <p>A chain of small beans rather than one long method, for two reasons that
 * both showed up in practice. Adding a fulfilment centre's new labelling rule
 * should be a new class, not an edit to a method every other rule also lives
 * in. And each check has to be able to fail <i>without stopping the others</i> —
 * a vendor whose carton count and seal number are both wrong should be told
 * both at once, not sent away to fix one and come back for the other.
 *
 * <p>Implementations return a list rather than throwing. An exception would end
 * the chain at the first problem, which is precisely the behaviour that makes
 * document validation infuriating to be on the receiving end of.
 */
public interface AsnValidator {

    /**
     * @return every failure this check found. Empty means it passed.
     */
    List<ValidationFailure> validate(AsnSubmission asn, Shipment shipment);

    /** Short name for logging and for the checks-run count. */
    default String name() {
        return getClass().getSimpleName();
    }
}
