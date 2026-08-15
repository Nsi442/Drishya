package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.GrnDecision;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The fulfilment centre's verdict at receiving: what was counted against what
 * the advance shipping notice promised, and whether the load was taken.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GoodsReceipt {

    @Enumerated(EnumType.STRING)
    @Column(name = "grn_decision")
    private GrnDecision decision;

    @Column(name = "grn_expected_cartons")
    private int expectedCartons;

    @Column(name = "grn_received_cartons")
    private int receivedCartons;

    @Column(name = "grn_damaged_cartons")
    private int damagedCartons;

    /** Comma-separated document types the receiving desk actually checked. */
    @Column(name = "grn_documents_verified")
    private String documentsVerified;

    @Column(name = "grn_note", length = 1000)
    private String note;

    @Column(name = "grn_checked_at")
    private Instant checkedAt;

    @Column(name = "grn_checked_by")
    private String checkedBy;
}
