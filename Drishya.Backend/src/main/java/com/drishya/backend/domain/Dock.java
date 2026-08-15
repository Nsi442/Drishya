package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.DockType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A loading bay at a fulfilment centre. */
@Entity
@Table(name = "docks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Dock {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fc_id")
    private FulfilmentCentre fulfilmentCentre;

    private String name;

    @Enumerated(EnumType.STRING)
    private DockType type;

    private boolean active;

    private int maxVehicleLengthFt;
}
