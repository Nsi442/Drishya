package com.drishya.backend.domain;

import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A seller dispatching goods into a marketplace fulfilment centre — the
 * customer of this product.
 *
 * <p>The scorecard fields hold a starting baseline only. Anything the platform
 * can observe for itself (on-time rate, document accuracy, rejection rate) is
 * recomputed from actual shipments rather than trusted from here.
 */
@Entity
@Table(name = "vendors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Vendor {

    @Id
    private String id;

    private String name;

    private String city;

    @Embedded
    private GeoPoint location;

    private String contact;

    private int onTimePct;

    private int docAccuracyPct;

    private int avgDetentionMin;

    private int rejectionRatePct;
}
