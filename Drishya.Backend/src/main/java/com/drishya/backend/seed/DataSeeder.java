package com.drishya.backend.seed;

import com.drishya.backend.domain.AppUser;
import com.drishya.backend.domain.Carrier;
import com.drishya.backend.domain.Dock;
import com.drishya.backend.domain.Driver;
import com.drishya.backend.domain.FulfilmentCentre;
import com.drishya.backend.domain.Geo;
import com.drishya.backend.domain.GeoPoint;
import com.drishya.backend.domain.Vehicle;
import com.drishya.backend.domain.Vendor;
import com.drishya.backend.domain.enums.DeviceStatus;
import com.drishya.backend.domain.enums.DockType;
import com.drishya.backend.domain.enums.Role;
import com.drishya.backend.repo.AppUserRepository;
import com.drishya.backend.repo.CarrierRepository;
import com.drishya.backend.repo.DockRepository;
import com.drishya.backend.repo.DriverRepository;
import com.drishya.backend.repo.FulfilmentCentreRepository;
import com.drishya.backend.repo.VehicleRepository;
import com.drishya.backend.repo.VendorRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Populates an empty database on startup so the app is useful the moment it
 * boots — no fixtures to import, no SQL to run.
 *
 * <p>Everything is derived from fixed seeds, so a restart rebuilds an identical
 * dataset. Seeding is skipped entirely if any vendors already exist, which means
 * this is safe against a real database that has been written to.
 */
@Component
@Order(1)
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    /** Demo password for all three accounts. Documented on the login screen. */
    public static final String DEMO_PASSWORD = "drishya";

    private final VendorRepository vendors;
    private final FulfilmentCentreRepository centres;
    private final DockRepository docks;
    private final CarrierRepository carriers;
    private final VehicleRepository vehicles;
    private final DriverRepository drivers;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final ShipmentSeeder shipmentSeeder;
    private final LaneSeeder laneSeeder;
    private final TripSeeder tripSeeder;

    public DataSeeder(VendorRepository vendors, FulfilmentCentreRepository centres, DockRepository docks,
                      CarrierRepository carriers, VehicleRepository vehicles, DriverRepository drivers,
                      AppUserRepository users, PasswordEncoder passwordEncoder, ShipmentSeeder shipmentSeeder,
                      LaneSeeder laneSeeder,
                      TripSeeder tripSeeder) {
        this.vendors = vendors;
        this.centres = centres;
        this.docks = docks;
        this.carriers = carriers;
        this.vehicles = vehicles;
        this.drivers = drivers;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.shipmentSeeder = shipmentSeeder;
        this.laneSeeder = laneSeeder;
        this.tripSeeder = tripSeeder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (vendors.count() > 0) {
            log.info("Database already populated — skipping seed");
            return;
        }

        log.info("Seeding reference data");
        List<FulfilmentCentre> sites = seedCentres();
        seedDocks(sites);
        List<Vendor> vendorList = seedVendors();
        List<Carrier> carrierList = seedCarriers();
        List<Vehicle> vehicleList = seedVehicles(carrierList);
        List<Driver> driverList = seedDrivers(vehicleList);
        seedUsers(vendorList, driverList, sites);

        shipmentSeeder.seed(vendorList, sites, vehicleList, driverList);

        // Lanes and the shared history last: they hang off the sites, and
        // the ETA engine has nothing to divide by without them.
        laneSeeder.seed();

        // Vehicles on the road, last reporting a minute ago. Without these the
        // live map — the page the product is about — opens empty on a fresh
        // database and needs the simulator run before it shows anything.
        tripSeeder.seed();

        log.info("Seed complete: {} vendors, {} vehicles, {} drivers, {} sites",
                vendorList.size(), vehicleList.size(), driverList.size(), sites.size());
    }

    private List<FulfilmentCentre> seedCentres() {
        List<FulfilmentCentre> saved = new ArrayList<>();
        for (ReferenceData.Site site : ReferenceData.FULFILMENT_CENTRES) {
            // Setters rather than the all-args constructor: the entity gained a
            // dock location and a geofence radius when PostGIS landed, and a
            // positional constructor silently reorders when that happens.
            FulfilmentCentre fc = new FulfilmentCentre();
            fc.setId(site.id());
            fc.setName(site.name());
            fc.setCity(site.city());
            fc.setLocation(new GeoPoint(site.lat(), site.lng()));
            fc.setDockCount(site.docks());
            fc.setOpeningHour(6);
            fc.setClosingHour(22);
            fc.setDockLocation(Geo.point(site.dockLat(), site.dockLng()));
            fc.setGeofenceRadiusM(site.geofenceM());
            saved.add(centres.save(fc));
        }
        return saved;
    }

    /**
     * A couple of bays at each site take containers rather than trucks, which is
     * what makes the dock scheduler's conflict rules non-trivial.
     */
    private void seedDocks(List<FulfilmentCentre> sites) {
        for (FulfilmentCentre fc : sites) {
            for (int i = 0; i < fc.getDockCount(); i++) {
                boolean container = i >= fc.getDockCount() - 2;
                Dock dock = new Dock(
                        fc.getId() + "-dock-" + (i + 1),
                        fc,
                        "Dock " + (i + 1),
                        container ? DockType.CONTAINER : DockType.STANDARD,
                        true,
                        container ? 40 : 24);
                docks.save(dock);
            }
        }
    }

    private List<Vendor> seedVendors() {
        List<Vendor> saved = new ArrayList<>();
        List<String> names = ReferenceData.VENDOR_NAMES;
        for (int i = 0; i < names.size(); i++) {
            ReferenceData.City city = ReferenceData.VENDOR_CITIES.get(i % ReferenceData.VENDOR_CITIES.size());
            Vendor vendor = new Vendor();
            vendor.setId("vendor-" + (i + 1));
            vendor.setName(names.get(i));
            vendor.setCity(city.name());
            vendor.setLocation(new GeoPoint(city.lat(), city.lng()));
            vendor.setContact("+91 98" + String.valueOf(100000000L + i * 7654321L).substring(0, 8));
            vendor.setOnTimePct(78 + ((i * 5) % 20));
            vendor.setDocAccuracyPct(82 + ((i * 3) % 16));
            vendor.setAvgDetentionMin(20 + ((i * 11) % 60));
            vendor.setRejectionRatePct((i % 5) + 1);
            vendor.setSlug(names.get(i).toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""));
            vendor.setStatus("active");
            vendor.setCreatedAt(Instant.now());
            saved.add(vendors.save(vendor));
        }
        return saved;
    }

    private List<Carrier> seedCarriers() {
        List<Carrier> saved = new ArrayList<>();
        List<String> names = ReferenceData.CARRIERS;
        for (int i = 0; i < names.size(); i++) {
            Carrier carrier = new Carrier(
                    "carrier-" + (i + 1),
                    names.get(i),
                    3200 + (i % 10) * 350,
                    40 + i * 13,
                    74 + ((i * 6) % 22));
            saved.add(carriers.save(carrier));
        }
        return saved;
    }

    private List<Vehicle> seedVehicles(List<Carrier> carrierList) {
        DeviceStatus[] deviceCycle = {
                DeviceStatus.ONLINE, DeviceStatus.ONLINE, DeviceStatus.ONLINE,
                DeviceStatus.OFFLINE, DeviceStatus.LOW_BATTERY};

        List<Vehicle> saved = new ArrayList<>();
        Instant now = Instant.now();
        for (int i = 0; i < 25; i++) {
            DeviceStatus device = deviceCycle[i % deviceCycle.length];
            Vehicle vehicle = new Vehicle();
            vehicle.setId("vehicle-" + (i + 1));
            vehicle.setRegNumber("%s-%d-%s-%d".formatted(
                    ReferenceData.STATE_CODES[i % 6],
                    10 + (i % 40),
                    ReferenceData.SERIES_CODES[i % 4],
                    1000 + i * 37));
            vehicle.setType(ReferenceData.VEHICLE_TYPES.get(i % ReferenceData.VEHICLE_TYPES.size()));
            vehicle.setCarrier(carrierList.get(i % carrierList.size()));
            vehicle.setDeviceStatus(device);
            vehicle.setBatteryPct(device == DeviceStatus.LOW_BATTERY ? 12 + (i % 8) : 60 + (i % 40));
            vehicle.setCostPerTrip(3200 + (i % 10) * 350);
            vehicle.setCapacityKg(ReferenceData.CAPACITIES_KG[i % 5]);
            // An offline device is one whose last position is already stale.
            vehicle.setLastPing(device == DeviceStatus.OFFLINE
                    ? now.minus(38, ChronoUnit.MINUTES)
                    : now.minusSeconds(i * 7L));
            saved.add(vehicles.save(vehicle));
        }
        return saved;
    }

    private List<Driver> seedDrivers(List<Vehicle> vehicleList) {
        List<Driver> saved = new ArrayList<>();
        List<String> names = ReferenceData.DRIVER_NAMES;
        Instant now = Instant.now();
        for (int i = 0; i < names.size(); i++) {
            Driver driver = new Driver();
            driver.setId("driver-" + (i + 1));
            driver.setName(names.get(i));
            driver.setPhone("+91 97" + String.valueOf(200000000L + i * 8765432L).substring(0, 8));
            driver.setLicenceExpiry(now.plus(60L + i * 17L, ChronoUnit.DAYS));
            driver.setRating(Math.round((3.6 + ((i * 7) % 14) / 10.0) * 10) / 10.0);
            driver.setTripsCompleted(40 + ((i * 13) % 200));
            driver.setAvailable(i % 4 != 0);
            driver.setLanguage(i % 3 == 0 ? "hi" : "en");
            driver.setVehicle(vehicleList.get(i % vehicleList.size()));
            saved.add(drivers.save(driver));
        }
        return saved;
    }

    /** The three accounts behind the login screen's one-click demo buttons. */
    private void seedUsers(List<Vendor> vendorList, List<Driver> driverList, List<FulfilmentCentre> sites) {
        String hash = passwordEncoder.encode(DEMO_PASSWORD);

        AppUser vendorUser = new AppUser();
        vendorUser.setId("user-vendor-1");
        vendorUser.setEmail("priya@anandauto.example");
        vendorUser.setPasswordHash(hash);
        vendorUser.setName("Priya Raghavan");
        vendorUser.setRole(Role.VENDOR_ADMIN);
        vendorUser.setTitle("Head of Dispatch");
        vendorUser.setOrgId(vendorList.get(0).getId());
        vendorUser.setOrgName(vendorList.get(0).getName());
        vendorUser.setPhone("+91 98220 41180");
        vendorUser.setInitials("PR");
        // The tenant FK, not just the loose orgId string. Every tenant-scoped
        // query reads this, and an account without it can see nothing at all.
        vendorUser.setTenant(vendorList.get(0));
        users.save(vendorUser);

        // A second vendor account on a different tenant. Without one there is
        // no way to demonstrate — or test — that isolation actually holds.
        AppUser dispatcherUser = new AppUser();
        dispatcherUser.setId("user-vendor-2");
        dispatcherUser.setEmail("arjun@nimbustextiles.example");
        dispatcherUser.setPasswordHash(hash);
        dispatcherUser.setName("Arjun Mehta");
        dispatcherUser.setRole(Role.DISPATCHER);
        dispatcherUser.setTitle("Dispatch Coordinator");
        dispatcherUser.setOrgId(vendorList.get(1).getId());
        dispatcherUser.setOrgName(vendorList.get(1).getName());
        dispatcherUser.setTenant(vendorList.get(1));
        dispatcherUser.setPhone("+91 98204 77321");
        dispatcherUser.setInitials("AM");
        users.save(dispatcherUser);

        AppUser driverUser = new AppUser();
        driverUser.setId("user-driver-1");
        driverUser.setEmail("ramesh@fleet.example");
        driverUser.setPasswordHash(hash);
        driverUser.setName(driverList.get(0).getName());
        driverUser.setRole(Role.DRIVER);
        driverUser.setTitle("Driver");
        driverUser.setOrgId("carrier-1");
        driverUser.setOrgName(ReferenceData.CARRIERS.get(0));
        driverUser.setPhone(driverList.get(0).getPhone());
        driverUser.setInitials("RK");
        driverUser.setDriverId(driverList.get(0).getId());
        driverUser.setLanguage("en");
        users.save(driverUser);

        AppUser fcUser = new AppUser();
        fcUser.setId("user-fc-1");
        fcUser.setEmail("imran@fcbhiwandi.example");
        fcUser.setPasswordHash(hash);
        fcUser.setName("Imran Qureshi");
        fcUser.setRole(Role.FC);
        fcUser.setTitle("Inbound Manager");
        fcUser.setOrgId(sites.get(0).getId());
        fcUser.setOrgName(sites.get(0).getName());
        fcUser.setPhone("+91 99300 22114");
        fcUser.setInitials("IQ");
        users.save(fcUser);
    }
}
