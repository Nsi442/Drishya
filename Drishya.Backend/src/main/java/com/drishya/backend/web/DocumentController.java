package com.drishya.backend.web;

import com.drishya.backend.dto.DocumentDto;
import com.drishya.backend.dto.request.Requests;
import com.drishya.backend.service.DocumentService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import com.drishya.backend.config.AuthTokenFilter;
import com.drishya.backend.service.CallerService;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    private final CallerService callers;

    public DocumentController(DocumentService documentService,
                              CallerService callers) {
        this.callers = callers;
        this.documentService = documentService;
    }

    @GetMapping
    public List<DocumentDto> list(
            @RequestAttribute(AuthTokenFilter.USER_ID_ATTRIBUTE) String userId,
            @RequestParam(required = false) String status,
                                  @RequestParam(required = false) String type,
                                  @RequestParam(required = false) String search,
                                  @RequestParam(required = false) String shipmentId) {
        return documentService.list(callers.resolve(userId), status, type, search, shipmentId);
    }

    @PostMapping("/{documentId}/reupload")
    public DocumentDto reupload(@PathVariable String documentId,
                                @RequestBody Requests.ReuploadDocument request) {
        return documentService.reupload(documentId, request);
    }

    @PostMapping("/{documentId}/validate")
    public DocumentDto validate(@PathVariable String documentId) {
        return documentService.validate(documentId);
    }
}
