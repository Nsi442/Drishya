package com.drishya.backend.service.eta;

import com.drishya.backend.domain.Trip;
import com.drishya.backend.repo.TripRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recomputes the estimate for every active trip, once a minute.
 *
 * <p>A prediction is only worth anything while it can still change a decision,
 * so it has to keep up with the road. Sixty seconds is roughly the interval at
 * which a lorry's situation can meaningfully change, and cheap enough at this
 * scale — the whole job is one indexed query plus a handful of history lookups
 * per trip.
 *
 * <p><b>Runs cross-tenant, deliberately.</b> This is the system acting on its
 * own behalf rather than serving a request, so there is no caller to be scoped
 * to. The repository method it uses is named
 * {@code findAllActiveAcrossTenants} loudly enough that using it inside a
 * controller would look wrong in review.
 */
@Component
public class EtaScheduler {

    private static final Logger log = LoggerFactory.getLogger(EtaScheduler.class);

    private final TripRepository trips;
    private final EtaService eta;

    public EtaScheduler(TripRepository trips, EtaService eta) {
        this.trips = trips;
        this.eta = eta;
    }

    /**
     * fixedDelay rather than fixedRate: if a cycle ever runs long, the next one
     * waits instead of piling up behind it. On a t3.micro, overlapping runs of
     * a job that writes to every active trip is how a demo turns into a lock
     * contention problem.
     */
    @Scheduled(fixedDelayString = "${drishya.eta.cycle-ms:60000}", initialDelayString = "30000")
    @Transactional
    public void recomputeActiveTrips() {
        List<Trip> active = trips.findAllActiveAcrossTenants();
        if (active.isEmpty()) {
            return;
        }

        int predicted = 0;
        int skipped = 0;
        for (Trip trip : active) {
            try {
                if (eta.predict(trip).isPresent()) {
                    predicted++;
                } else {
                    skipped++;
                }
            } catch (Exception e) {
                // One bad trip must not stop the other nineteen being updated.
                log.error("ETA recompute failed for trip {}: {}", trip.getId(), e.getMessage());
            }
        }

        log.debug("ETA cycle: {} predicted, {} awaiting a first fix or a lane",
                predicted, skipped);
    }
}
