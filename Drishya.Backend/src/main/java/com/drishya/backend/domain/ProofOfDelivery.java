package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Lob;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * What the driver captured at the dock. Embedded in the shipment because a POD
 * has no life of its own — it exists only as the closing act of one delivery.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ProofOfDelivery {

    @Column(name = "pod_receiver_name")
    private String receiverName;

    @Column(name = "pod_received_at")
    private Instant receivedAt;

    @Column(name = "pod_signature_at")
    private Instant signatureAt;

    @Column(name = "pod_photos")
    private int photos;

    @Column(name = "pod_cartons_received")
    private int cartonsReceived;

    @Column(name = "pod_damage_note", length = 1000)
    private String damageNote;

    /**
     * The signature as a data URL. Stored as a LOB because a captured PNG runs
     * to a few kilobytes and would not fit a normal column.
     */
    @Lob
    @Column(name = "pod_signature")
    private String signature;
}
