package com.drishya.backend.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
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
 *
 * <p><b>This is the tenant.</b> The table is called tenants because that is
 * what it is — the isolation boundary every query outside the two shared
 * history tables is filtered by. The class keeps the name Vendor because that
 * is the word the product, the API and the frontend all use for it; inventing a
 * second entity so the two names could match would have meant two rows per
 * organisation that must never disagree.
 */
@Entity
@Table(name = "tenants")
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

    /** URL-safe handle. Stable across renames, unlike the display name. */
    @Column(unique = true)
    private String slug;

    /**
     * Suspending a tenant has to stop its data being read without deleting any
     * of it — an evidence pack for a disputed chargeback may be needed long
     * after the account stops trading.
     */
    private String status;

    @Column(name = "created_at")
    private Instant createdAt;

    private int onTimePct;

    private int docAccuracyPct;

    private int avgDetentionMin;

    private int rejectionRatePct;
}
