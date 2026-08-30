package com.drishya.backend.service;

import com.drishya.backend.domain.Alert;
import com.drishya.backend.domain.enums.AlertSeverity;
import com.drishya.backend.domain.enums.AlertType;
import com.drishya.backend.repo.AlertRepository;
import com.drishya.backend.service.eta.DelayDetected;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Turns a predicted delay into something a person will actually see.
 *
 * <p>The sender is deliberately an interface with a logging implementation.
 * Email and SMS are a credential and a billing account away, neither of which
 * belongs in this build, and pretending otherwise would mean a demo that fails
 * on the venue network. What matters architecturally is that the delivery
 * mechanism is swappable and that nothing upstream knows which one is in use.
 *
 * <p>The alert itself is real and lands in the same feed the rest of the
 * product reads, pointing at a shipment that is genuinely predicted to be late —
 * so clicking through from the notification drawer arrives somewhere coherent.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    /**
     * Where a notification goes. Swap the implementation, not the callers.
     */
    public interface Sender {
        void send(String recipientTenantId, String subject, String body);
    }

    /**
     * The only implementation in this build. Named honestly: it logs, and the
     * README says so rather than implying messages are being delivered.
     */
    @Service
    public static class LoggingSender implements Sender {
        private static final Logger out = LoggerFactory.getLogger(LoggingSender.class);

        @Override
        public void send(String recipientTenantId, String subject, String body) {
            out.info("NOTIFY tenant={} | {} | {}", recipientTenantId, subject, body);
        }
    }

    private final AlertRepository alerts;
    private final Sender sender;

    public NotificationService(AlertRepository alerts, Sender sender) {
        this.alerts = alerts;
        this.sender = sender;
    }

    /**
     * Raises the alert for a predicted delay.
     *
     * <p>Async and in its own transaction: the prediction that detected the
     * delay has already been stored and must not be rolled back because the
     * notification path had a bad day.
     */
    @Async
    @EventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onDelayDetected(DelayDetected event) {
        try {
            Alert alert = new Alert();
            alert.setId("alert-" + UUID.randomUUID().toString().substring(0, 12));
            alert.setType(AlertType.DELAY);
            // Missing a booked slot means a refused delivery or a rebooking
            // negotiation, either of which needs a person today.
            alert.setSeverity(event.lateByMinutes() >= 60
                    ? AlertSeverity.CRITICAL : AlertSeverity.WARNING);
            alert.setTitle("Predicted to miss the booked slot");
            alert.setMessage(String.format(
                    "Shipment %s is predicted to reach a bay %d minutes after its slot closes. "
                            + "Rebooking now is cheaper than being turned away at the gate.",
                    event.shipmentId(), event.lateByMinutes()));
            alert.setShipmentId(event.shipmentId());
            alert.setVendorId(event.tenantId());
            alert.setAt(Instant.now());
            alerts.save(alert);

            sender.send(event.tenantId(), alert.getTitle(), alert.getMessage());
        } catch (Exception e) {
            log.error("Could not raise a delay alert for shipment {}: {}",
                    event.shipmentId(), e.getMessage(), e);
        }
    }
}
