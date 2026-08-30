package com.drishya.backend.domain;

import com.drishya.backend.domain.enums.DocumentStatus;
import com.drishya.backend.domain.enums.DocumentType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Paperwork attached to a consignment, and whether it will survive contact with
 * the gate. There is no file store in this build — the record, its number and
 * its validation state are real; the PDF is not.
 */
@Entity
@Table(name = "shipment_documents")
@Getter
@Setter
@NoArgsConstructor
public class ShipmentDocument {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "shipment_id")
    private Shipment shipment;

    @Enumerated(EnumType.STRING)
    private DocumentType type;

    private String number;

    @Enumerated(EnumType.STRING)
    private DocumentStatus status;

    private Instant uploadedAt;

    /** E-way bills expire; a bill valid now may not be at the booked slot. */
    private Instant expiresAt;

    private int sizeKb;

    private int pages;

    /**
     * Why validation failed, in words the vendor can act on.
     *
     * <p>Long enough for several failures at once. A notice that gets the
     * carton count, the seal format and the e-way bill wrong together should
     * say so in one place rather than being truncated to whichever came first.
     */
    @Column(length = 2000)
    private String note;

    /**
     * The same failures, structured.
     *
     * <p>The validator chain produces a code, a field, an expected value and an
     * actual one for every problem it finds. Storing only the prose summary in
     * {@code note} discarded everything a machine could act on — you could read
     * why a notice failed but not filter on it or count it. Both are kept: this
     * for anything that needs to reason about the failures, {@code note} for a
     * list view where the full structure would be noise.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "failure_reasons", columnDefinition = "jsonb")
    private List<Map<String, Object>> failureReasons;

    public ShipmentDocument(String id, DocumentType type, String number, DocumentStatus status) {
        this.id = id;
        this.type = type;
        this.number = number;
        this.status = status;
    }
}
