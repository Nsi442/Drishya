package com.drishya.backend.web;

import com.drishya.backend.service.eta.TrainingDataService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exports scored predictions as CSV, for training.
 *
 * <p>One row per prediction that has an actual dock-in recorded against it:
 * the twelve features exactly as they were at the moment of prediction, plus
 * the label. <b>The features are replayed from what was stored, not
 * recomputed</b> — recomputing them today against today's history would leak
 * information the model will not have at serving time and produce an accuracy
 * figure that evaporates in production.
 *
 * <p><b>Not part of the public API.</b> It is cross-tenant by nature — the whole
 * point is to learn from every trip in the cluster — so it cannot be exposed to
 * a normal bearer token, which is always scoped to one tenant. It is gated on a
 * separate service token instead, and returns 404 rather than 401 when that
 * token is missing so the endpoint does not advertise itself.
 */
@RestController
@RequestMapping("/api/v1/internal")
public class InternalTrainingController {

    private final TrainingDataService training;
    private final InternalServiceToken gate;

    public InternalTrainingController(TrainingDataService training, InternalServiceToken gate) {
        this.training = training;
        this.gate = gate;
    }

    @GetMapping(value = "/training-data", produces = "text/csv")
    public ResponseEntity<String> trainingData(
            @RequestHeader(value = "X-Service-Token", required = false) String presented) {

        gate.require(presented);

        String csv = training.exportCsv();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/csv"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"drishya-eta-training.csv\"")
                .body(csv);
    }
}
