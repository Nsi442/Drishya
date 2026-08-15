package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.IncidentType;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Something a driver reported from the road. */
@Entity
@Table(name = "incidents")
@Getter
@Setter
@NoArgsConstructor
public class Incident {

    @Id
    private String id;

    @Enumerated(EnumType.STRING)
    private IncidentType type;

    @Column(name = "shipment_id")
    private String shipmentId;

    @Column(length = 2000)
    private String description;

    private int photos;

    /** Attached automatically — a report without a location is far less useful. */
    @Embedded
    private GeoPoint location;

    private String locationSource;

    private String reportedBy;

    private Instant at;

    private String status;
}
