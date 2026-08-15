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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    @GetMapping
    public List<DocumentDto> list(@RequestParam(required = false) String status,
                                  @RequestParam(required = false) String type,
                                  @RequestParam(required = false) String search,
                                  @RequestParam(required = false) String shipmentId) {
        return documentService.list(status, type, search, shipmentId);
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
