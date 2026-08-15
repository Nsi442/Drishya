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
 * A marketplace fulfilment centre receiving inbound goods.
 *
 * <p>Deliberately generic — no real marketplace is ever named, here or in any
 * response this API produces.
 */
@Entity
@Table(name = "fulfilment_centres")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class FulfilmentCentre {

    @Id
    private String id;

    private String name;

    private String city;

    @Embedded
    private GeoPoint location;

    /** How many bays the site has; docks are generated from this. */
    private int dockCount;

    /** Operating window, as hours of the day. Slots cannot be booked outside it. */
    private int openingHour;

    private int closingHour;
}
