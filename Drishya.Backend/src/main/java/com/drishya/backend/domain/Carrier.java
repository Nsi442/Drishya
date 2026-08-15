package com.drishya.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A haulier moving consignments on a vendor's behalf. */
@Entity
@Table(name = "carriers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Carrier {

    @Id
    private String id;

    private String name;

    private int costPerTrip;

    private int tripsThisMonth;

    /** Baseline only — the observed rate is computed from delivered shipments. */
    private int onTimePct;
}
