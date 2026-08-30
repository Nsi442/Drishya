package com.drishya.backend;

import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.Position;
import com.drishya.backend.domain.Shipment;
import com.drishya.backend.domain.Trip;
import com.drishya.backend.domain.Vendor;
import com.drishya.backend.domain.enums.PositionSource;
import com.drishya.backend.domain.enums.TripStatus;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.PositionRepository;
import com.drishya.backend.repo.ShipmentRepository;
import com.drishya.backend.repo.TripRepository;
import com.drishya.backend.repo.VendorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the spatial layer works against real PostGIS, through Hibernate.
 *
 * <p><b>Why this cannot be an H2 test.</b> H2 has no ST_DWithin, no geography
 * type and no spheroid. Every query in this class would fail to parse there,
 * which is the honest answer — a geofence cannot be unit-tested against a
 * database that has no concept of distance.
 *
 * <p><b>Why it cannot be a compile-time check either.</b> Hibernate 7 is free
 * to emit different SQL than 6 did for the same mapping, and the geography
 * columns only behave correctly if hibernate-spatial actually registered its
 * types against the Postgres dialect. Both of those are runtime properties. A
 * mapping that compiles proves nothing about either.
 *
 * <p>The container image is pinned to the same PostGIS and Postgres majors as
 * docker-compose and the RDS target, so a query that passes here behaves
 * identically in all three.
 */
@SpringBootTest
@Testcontainers
@DisplayName("PostGIS geofencing and tenant isolation")
class GeofenceSpatialTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGIS = new PostgreSQLContainer(
            DockerImageName.parse("postgis/postgis:16-3.4")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    FulfilmentCentreRepository centres;

    @Autowired
    TripRepository trips;

    @Autowired
    PositionRepository positions;

    @Autowired
    ShipmentRepository shipments;

    @Autowired
    VendorRepository vendors;

    /**
     * Waits for the seed before asserting anything.
     *
     * <p>Seeding moved off the startup path so a slow database cannot hold a
     * deployment hostage — it now runs asynchronously once the application is
     * already serving. That is the right behaviour in production and it means a
     * test can observe an empty database if it asserts too early.
     *
     * <p>Waiting is deliberate rather than reverting to a synchronous seed for
     * the tests: a suite that exercises a different startup path from the one
     * that actually ships is a suite that can pass while production is broken.
     */
    @BeforeEach
    void waitForSeed() {
        long deadline = System.currentTimeMillis() + 90_000;
        while (System.currentTimeMillis() < deadline) {
            if (centres.count() > 0 && vendors.count() > 1 && shipments.count() > 0) {
                return;
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrupted waiting for the seed", e);
            }
        }
        throw new IllegalStateException("Seed did not complete within 90s");
    }

    // --- the geofence -------------------------------------------------------

    @Test
    @DisplayName("Flyway builds the schema and PostGIS is actually enabled")
    void migrationsRunAgainstPostgis() {
        // If V1 had not run, the geography columns in V2 would have failed to
        // parse and the context would not have started at all.
        List<FulfilmentCentre> all = centres.findAll();
        assertThat(all).isNotEmpty();
        assertThat(all).allSatisfy(fc -> {
            assertThat(fc.getDockLocation()).isNotNull();
            assertThat(fc.getGeofenceRadiusM()).isPositive();
        });
    }

    @Test
    @DisplayName("a point at the bays falls inside that site's fence")
    void pointAtDockIsInsideGeofence() {
        FulfilmentCentre bhiwandi = centres.findById("fc-bhiwandi").orElseThrow();
        double lat = Geo.lat(bhiwandi.getDockLocation());
        double lon = Geo.lon(bhiwandi.getDockLocation());

        Optional<FulfilmentCentre> hit = centres.findEnclosingGeofence(lat, lon);

        assertThat(hit).isPresent();
        assertThat(hit.get().getId()).isEqualTo("fc-bhiwandi");
    }

    @Test
    @DisplayName("a point well outside every fence matches nothing")
    void pointFarAwayIsOutsideEveryGeofence() {
        // Middle of the Arabian Sea. Also the result you get if lat and lon are
        // swapped somewhere, which is exactly the bug this guards.
        assertThat(centres.findEnclosingGeofence(15.0, 68.0)).isEmpty();
    }

    @Test
    @DisplayName("the fence has an edge, and it is where the radius says")
    void geofenceBoundaryIsTheConfiguredRadius() {
        FulfilmentCentre fc = centres.findById("fc-whitefield").orElseThrow();
        double lat = Geo.lat(fc.getDockLocation());
        double lon = Geo.lon(fc.getDockLocation());
        int radius = fc.getGeofenceRadiusM();

        // One degree of latitude is ~111_320 m. Step just inside and just
        // outside the radius and confirm the predicate flips.
        double insideOffset = (radius * 0.5) / 111_320d;
        double outsideOffset = (radius * 2.0) / 111_320d;

        assertThat(centres.findEnclosingGeofence(lat + insideOffset, lon))
                .as("half a radius north should still be inside")
                .isPresent();

        assertThat(centres.findEnclosingGeofence(lat + outsideOffset, lon))
                .as("two radii north should be outside")
                .isEmpty();
    }

    @Test
    @DisplayName("ST_Distance returns metres on the spheroid, not degrees")
    void distanceComesBackInMetres() {
        FulfilmentCentre fc = centres.findById("fc-bhiwandi").orElseThrow();
        double lat = Geo.lat(fc.getDockLocation());
        double lon = Geo.lon(fc.getDockLocation());

        // Exactly one degree of latitude north. On a spheroid that is close to
        // 110.6 km; in raw degrees it would come back as 1.0, which is the
        // failure mode when a column is geometry rather than geography.
        Double metres = centres.distanceToDockMetres("fc-bhiwandi", lat + 1.0, lon);

        assertThat(metres).isNotNull();
        assertThat(metres).isBetween(110_000d, 111_500d);
    }

    // --- provenance and geometry round-tripping -----------------------------

    @Test
    @Transactional
    @DisplayName("a position round-trips through a geography column with its source intact")
    void positionRoundTripsThroughPostgis() {
        Shipment shipment = shipments.findAll().stream()
                .filter(s -> s.getVendor() != null)
                .findFirst().orElseThrow();

        Trip trip = new Trip();
        trip.setId("trip-spatial-test");
        trip.setShipment(shipment);
        trip.setTenant(shipment.getVendor());
        trip.setStatus(TripStatus.ACTIVE);
        trip.setStartedAt(Instant.now());
        trips.save(trip);

        Position p = new Position();
        p.setTrip(trip);
        p.setLocation(Geo.point(19.2958, 73.0648));
        p.setSpeedKmph(42.5);
        p.setHeadingDeg(180.0);
        p.setDeviceTimestamp(Instant.now().minusSeconds(30));
        p.setReceivedAt(Instant.now());
        p.setSource(PositionSource.SIMULATED);
        positions.save(p);
        positions.flush();

        Position read = positions.findByTripIdOrderByDeviceTimestampAsc("trip-spatial-test")
                .getFirst();

        // Latitude must come back as latitude. JTS stores (x=lon, y=lat), so a
        // conversion that forgets to swap puts this shipment off Somalia.
        assertThat(read.getLat()).isCloseTo(19.2958, org.assertj.core.data.Offset.offset(1e-6));
        assertThat(read.getLon()).isCloseTo(73.0648, org.assertj.core.data.Offset.offset(1e-6));

        // Provenance survives the round trip. Simulated and browser fixes carry
        // different evidentiary weight and must never blend.
        assertThat(read.getSource()).isEqualTo(PositionSource.SIMULATED);

        // And the device time is preserved distinctly from the receive time.
        assertThat(read.getDeviceTimestamp()).isBefore(read.getReceivedAt());
        assertThat(read.latencySeconds()).isGreaterThanOrEqualTo(29);
    }

    // --- tenant isolation ---------------------------------------------------

    @Test
    @Transactional
    @DisplayName("tenant A cannot read tenant B's trip")
    void tenantCannotReadAnotherTenantsTrip() {
        List<Vendor> two = vendors.findAll().stream().limit(2).toList();
        Vendor tenantA = two.get(0);
        Vendor tenantB = two.get(1);
        assertThat(tenantA.getId()).isNotEqualTo(tenantB.getId());

        Shipment shipmentOfA = shipments.findAll().stream()
                .filter(s -> s.getVendor() != null && s.getVendor().getId().equals(tenantA.getId()))
                .findFirst().orElseThrow();

        Trip tripOfA = new Trip();
        tripOfA.setId("trip-tenant-isolation");
        tripOfA.setShipment(shipmentOfA);
        tripOfA.setTenant(tenantA);
        tripOfA.setStatus(TripStatus.ACTIVE);
        tripOfA.setStartedAt(Instant.now());
        trips.save(tripOfA);
        trips.flush();

        // The owner sees it.
        assertThat(trips.findByIdAndTenantId("trip-tenant-isolation", tenantA.getId()))
                .as("the owning tenant can read its own trip")
                .isPresent();

        // The other tenant gets an empty Optional — indistinguishable from the
        // trip not existing, which is the point. Telling B that the id is real
        // but forbidden already leaks that A has a trip.
        assertThat(trips.findByIdAndTenantId("trip-tenant-isolation", tenantB.getId()))
                .as("a different tenant must not be able to read it")
                .isEmpty();

        assertThat(trips.existsByIdAndTenantId("trip-tenant-isolation", tenantB.getId()))
                .isFalse();

        // And it does not appear in B's listing either.
        assertThat(trips.findByTenantIdOrderByStartedAtDesc(tenantB.getId()))
                .extracting(Trip::getId)
                .doesNotContain("trip-tenant-isolation");
    }
}
