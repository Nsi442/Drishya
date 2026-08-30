package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.TripEventType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Something that happened to a trip, as opposed to a state it sat in.
 *
 * <p>Append-only. This table is what the evidence pack is assembled from, so a
 * row is never edited or deleted — a corrected event is a new event, and the
 * wrong one stays visible. An audit trail that can be tidied up afterwards is
 * not an audit trail.
 *
 * <p>The payload is JSONB rather than a wide sparse table because the useful
 * detail differs completely per event type: a GATE_IN carries the fulfilment
 * centre and the distance at crossing, a DOC_REJECTED carries the failure
 * reasons, a DELAY_PREDICTED carries the predicted time and the booked window.
 * Columns for all of those would be null on almost every row.
 */
@Entity
@Table(name = "trip_events", indexes = {
        @Index(name = "idx_trip_event_trip", columnList = "trip_id, at"),
        @Index(name = "idx_trip_event_type", columnList = "type")
})
@Getter
@Setter
@NoArgsConstructor
public class TripEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id")
    private Trip trip;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TripEventType type;

    @Column(nullable = false)
    private Instant at;

    /** Human-readable line for the timeline. The payload holds the detail. */
    private String label;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> payload = new LinkedHashMap<>();

    public TripEvent(TripEventType type, Instant at, String label) {
        this.type = type;
        this.at = at;
        this.label = label;
    }

    /** Fluent payload building, so callers read as one statement. */
    public TripEvent with(String key, Object value) {
        if (payload == null) {
            payload = new LinkedHashMap<>();
        }
        payload.put(key, value);
        return this;
    }
}
