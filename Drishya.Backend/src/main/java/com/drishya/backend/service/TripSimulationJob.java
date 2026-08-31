package com.drishya.backend.service;

import com.drishya.backend.repo.TripSimulationRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Moves every running simulated vehicle, every few seconds.
 *
 * <p>This is the whole reason the feature is server-side. The browser
 * simulation in {@code useLiveShipments} stops the moment the tab is closed, so
 * a vehicle "left running" over lunch has not moved an inch by the time anybody
 * looks again. This keeps driving with nothing open.
 *
 * <p><b>Five seconds, not one.</b> The tick period is not the fix interval —
 * one tick emits as many fixes as the simulated time it covers calls for — so a
 * shorter period buys nothing but transactions. Five seconds is under the ten
 * the trips page polls at, which is what makes the map look continuous.
 *
 * <p><b>Cross-tenant, deliberately.</b> Like the ETA cycle, this is the system
 * acting on its own behalf rather than serving a request, so there is no caller
 * to be scoped to. The repository method it calls is named
 * {@code findAllRunningTripIdsAcrossTenants} loudly enough that using it inside
 * a controller would look wrong in review.
 */
@Component
public class TripSimulationJob {

    private static final Logger log = LoggerFactory.getLogger(TripSimulationJob.class);

    private final TripSimulationRepository simulations;
    private final TripSimulationService service;

    public TripSimulationJob(TripSimulationRepository simulations, TripSimulationService service) {
        this.simulations = simulations;
        this.service = service;
    }

    /**
     * fixedDelay rather than fixedRate, for the reason the ETA cycle uses it:
     * if a tick ever runs long, the next one waits instead of piling up behind
     * it. Overlapping ticks would have two threads advancing one vehicle from
     * the same {@code lastTickAt} and double-counting the ground it covered.
     *
     * <p>The initial delay keeps it clear of Flyway and the seeder on a cold
     * boot, which on a free-tier instance is the busiest the process ever gets.
     */
    @Scheduled(fixedDelayString = "${drishya.simulation.tick-ms:5000}",
               initialDelayString = "${drishya.simulation.initial-delay-ms:20000}")
    public void tick() {
        List<String> running = simulations.findAllRunningTripIdsAcrossTenants();
        if (running.isEmpty()) {
            return;
        }

        int moved = 0;
        int arrived = 0;
        for (String tripId : running) {
            try {
                if (service.advance(tripId)) {
                    moved++;
                } else {
                    arrived++;
                }
            } catch (Exception e) {
                // One vehicle that cannot be moved must not strand the others.
                // Logged rather than rethrown: an exception out of a scheduled
                // method is swallowed by the executor, and the next tick would
                // try the same broken route again with nothing on the record.
                log.error("Simulation tick failed for trip {}: {}", tripId, e.getMessage(), e);
            }
        }

        log.debug("Simulation tick: {} moving, {} finished this cycle", moved, arrived);
    }
}
