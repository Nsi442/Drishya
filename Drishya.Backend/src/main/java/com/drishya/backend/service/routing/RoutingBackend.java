package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import java.util.List;

/**
 * One service that can be asked for a road between two points.
 *
 * <p><b>Why this is an interface.</b> The product ran for a week drawing
 * straight lines because the single free router it used was answering every
 * request with a mislabelled encoding. Nothing was wrong with the code that
 * called it and nothing was wrong with the fallback; the fault was having one
 * source and no way to ask anybody else.
 *
 * <p>Implementations are tried in order and the first usable answer wins, so a
 * service that is down, rate-limited or misbehaving costs one attempt rather
 * than the feature. They must be independent to be worth having: a second
 * mirror of the same software behind the same proxy would have failed the same
 * way. {@code router.project-osrm.org} resolves to {@code
 * routing.openstreetmap.de}, which is why the alternative here is a different
 * operator running different software rather than another OSRM endpoint.
 *
 * <p><b>An implementation returns null rather than throwing</b> when the answer
 * is simply not usable — no route, an implausible one, a shape that does not
 * parse. Exceptions are for the transport failing, and the caller treats both
 * the same way: try the next one.
 */
public interface RoutingBackend {

    /** For the log, so a failure names who failed. */
    String name();

    /**
     * The road between two points, or null if this service cannot supply one.
     *
     * @return points ordered origin to destination, and the distance along the
     *     carriageway in kilometres — never the length of the returned
     *     polyline, which is thinned and would understate every lane.
     */
    Road route(GeoPoint origin, GeoPoint destination);

    /** What a backend found: the shape, and the distance that goes with it. */
    record Road(List<GeoPoint> points, double distanceKm) {}
}
