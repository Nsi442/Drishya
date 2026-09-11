package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * BRouter, at brouter.de. The second opinion.
 *
 * <p><b>Chosen for who runs it, not for what it does.</b> A second OSRM mirror
 * would have been no use: {@code router.project-osrm.org} resolves to
 * {@code routing.openstreetmap.de}, so the outage that drew straight lines for
 * a week would have taken both. This is a different operator running different
 * software, which is the only kind of alternative worth the code.
 *
 * <p>Free and keyless, like the first, so it stays inside this project's rule
 * against paid APIs — and it is asked second, so the load stays where it
 * already was unless something is wrong.
 *
 * <p>It answers in GeoJSON, which keeps the parsing close to OSRM's: the same
 * longitude-first coordinates, and a distance that must be read from the
 * properties rather than measured off the line.
 */
class BRouterBackend implements RoutingBackend {

    private static final Logger log = LoggerFactory.getLogger(BRouterBackend.class);

    private final RestClient client;
    private final String baseUrl;
    private final int maxPoints;

    BRouterBackend(RestClient client, String baseUrl, int maxPoints) {
        this.client = client;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.maxPoints = maxPoints;
    }

    @Override
    public String name() {
        return "brouter";
    }

    @Override
    public Road route(GeoPoint origin, GeoPoint destination) {
        // Longitude first again, this time pipe-separated in a query parameter.
        //
        // Built as a URI rather than a string, and that distinction is the
        // whole bug. A literal "|" is not a legal URI character, so it has to
        // be percent-encoded — but RestClient.uri(String) treats its argument
        // as a template and encodes it again, turning %7C into %257C, which
        // the far end decodes to the literal text "%7C" and cannot split on.
        // The symptom is a router that closes the connection: "header parser
        // received no bytes", naming nothing. Handing over a URI skips the
        // template step entirely, so it is encoded exactly once.
        URI uri = UriComponentsBuilder.fromUriString(baseUrl)
                .path("/brouter")
                .queryParam("lonlats", "%f,%f|%f,%f".formatted(
                        origin.getLng(), origin.getLat(),
                        destination.getLng(), destination.getLat()))
                .queryParam("profile", "car-fast")
                .queryParam("alternativeidx", 0)
                .queryParam("format", "geojson")
                .build()
                .encode()
                .toUri();

        BrouterResponse body = HttpRouting.get(client, uri, BrouterResponse.class);

        if (body == null || body.features() == null || body.features().isEmpty()) {
            log.warn("BRouter returned no features");
            return null;
        }

        Feature feature = body.features().getFirst();
        if (feature.geometry() == null || feature.geometry().coordinates() == null) {
            return null;
        }

        List<GeoPoint> points = new ArrayList<>();
        for (List<Double> c : feature.geometry().coordinates()) {
            // Three values per point, not two: BRouter appends elevation. Taking
            // the first two by index rather than unpacking the whole tuple is
            // what keeps that from mattering.
            if (c == null || c.size() < 2) {
                continue;
            }
            points.add(new GeoPoint(c.get(1), c.get(0)));
        }
        if (points.size() < 2) {
            return null;
        }

        double metres = trackLength(feature);
        if (metres <= 0) {
            log.warn("BRouter gave a route with no track-length; ignoring");
            return null;
        }

        return new Road(HttpRouting.simplify(points, maxPoints), metres / 1000.0);
    }

    /**
     * Distance in metres, from the properties.
     *
     * <p>A string, because BRouter reports every property as one. Measuring the
     * returned line instead would be wrong twice over: it is thinned, and it
     * carries elevation this project does not model.
     */
    private static double trackLength(Feature feature) {
        if (feature.properties() == null) {
            return -1;
        }
        Object raw = feature.properties().get("track-length");
        if (raw == null) {
            return -1;
        }
        try {
            return Double.parseDouble(raw.toString());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    // --- the wire shape BRouter answers with -------------------------------

    record BrouterResponse(String type, List<Feature> features) {}

    record Feature(String type, java.util.Map<String, Object> properties, Geometry geometry) {}

    record Geometry(String type, List<List<Double>> coordinates) {}
}
