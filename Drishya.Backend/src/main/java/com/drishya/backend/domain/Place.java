package com.drishya.backend.domain;

import jakarta.persistence.Embeddable;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A named point — a pickup warehouse or a fulfilment centre. Distinct from
 * {@link GeoPoint}, which is an anonymous coordinate on a route.
 */
@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Place {

    private double lat;

    private double lng;

    private String name;
}
