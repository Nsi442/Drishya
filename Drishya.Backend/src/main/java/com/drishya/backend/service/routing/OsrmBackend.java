package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;

/**
 * OSRM, as run publicly by FOSSGIS at router.project-osrm.org.
 *
 * <p>The default and the one this project started with. Free, no key, and no
 * promises: it is a demonstration server, and it demonstrated that by
 * mislabelling its content encoding for a week.
 */
class OsrmBackend implements RoutingBackend {

    private static final Logger log = LoggerFactory.getLogger(OsrmBackend.class);

    private final RestClient client;
    private final String baseUrl;
    private final int maxPoints;

    OsrmBackend(RestClient client, String baseUrl, int maxPoints) {
        this.client = client;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.maxPoints = maxPoints;
    }

    @Override
    public String name() {
        return "osrm";
    }

    @Override
    public Road route(GeoPoint origin, GeoPoint destination) {
        // OSRM takes LONGITUDE FIRST, in the path, and returns GeoJSON
        // coordinates in the same order. Both are the opposite of how every
        // other coordinate in this codebase is written, and getting either
        // backwards produces a route across the Arabian Sea rather than an
        // error, so both are converted in exactly one place: here.
        // overview=FULL, not simplified.
        //
        // "simplified" is OSRM's overview geometry, meant for a thumbnail of a
        // route rather than for following one. Measured on the deployed site it
        // returned a 1,242 km journey as 23 points, one of which was a single
        // 255 km straight line — a chord across half the country, drawn on the
        // map as though it were a road. The polyline came out 7.8% shorter than
        // the road distance OSRM reported beside it, which is the corner-cutting
        // showing up as arithmetic.
        //
        // "full" is the real carriageway geometry. It arrives as tens of
        // thousands of points and is reduced by HttpRouting.simplify(), which
        // drops the points a line can be drawn without instead of every nth one.
        String url = baseUrl + "/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson"
                .formatted(origin.getLng(), origin.getLat(),
                        destination.getLng(), destination.getLat());

        OsrmResponse body = HttpRouting.get(client, url, OsrmResponse.class);

        if (body == null || !"Ok".equals(body.code())
                || body.routes() == null || body.routes().isEmpty()) {
            log.warn("OSRM returned no usable route (code={})", body == null ? "null" : body.code());
            return null;
        }

        OsrmRoute route = body.routes().getFirst();
        if (route.geometry() == null || route.geometry().coordinates() == null) {
            return null;
        }

        List<GeoPoint> points = new ArrayList<>();
        for (List<Double> pair : route.geometry().coordinates()) {
            if (pair == null || pair.size() < 2) {
                continue;
            }
            points.add(new GeoPoint(pair.get(1), pair.get(0)));   // [lon, lat]
        }
        if (points.size() < 2) {
            return null;
        }

        return new Road(HttpRouting.simplify(points, maxPoints), route.distance() / 1000.0);
    }

    // --- the wire shape OSRM answers with ---------------------------------
    //
    // Only the fields actually used are declared; the rest — waypoints, legs,
    // weights — are ignored, which a test feeding a full response checks.

    record OsrmResponse(String code, List<OsrmRoute> routes) {}

    record OsrmRoute(double distance, double duration, OsrmGeometry geometry) {}

    record OsrmGeometry(String type, List<List<Double>> coordinates) {}
}
