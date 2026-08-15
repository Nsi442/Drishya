package com.drishya.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Someone who carries consignments, and uses the phone app to do it. */
@Entity
@Table(name = "drivers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Driver {

    @Id
    private String id;

    private String name;

    private String phone;

    private Instant licenceExpiry;

    private double rating;

    private int tripsCompleted;

    /** Whether dispatch may assign new work. The driver controls this themselves. */
    private boolean available;

    /** UI language for the driver app: "en" or "hi". */
    private String language;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    private Vehicle vehicle;
}
