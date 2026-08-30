package com.drishya.backend.domain;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LineString;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;

import java.util.List;

/**
 * Builds the JTS geometries the entity layer stores.
 *
 * <p><b>Longitude comes first.</b> JTS orders a coordinate (x, y), and for
 * WGS 84 that is (lon, lat) — the reverse of how every human writes it and of
 * how the API accepts it. Getting this backwards puts Indian shipments in the
 * Indian Ocean, silently and plausibly enough to survive a code review, so
 * every conversion in this codebase goes through here rather than calling the
 * GeometryFactory directly.
 *
 * <p>Geometries never leave the entity layer. DTOs expose plain lat/lon
 * doubles: Jackson 3 changed group IDs and class names, and the JTS datatype
 * module has no dependable Jackson 3 build, so serialising a Point directly is
 * a runtime failure waiting for the first response that contains one.
 */
public final class Geo {

    /** WGS 84. The same SRID the geography columns are declared with. */
    public static final int SRID = 4326;

    private static final GeometryFactory FACTORY =
            new GeometryFactory(new PrecisionModel(PrecisionModel.FLOATING), SRID);

    private Geo() {
    }

    /** Written lat/lon order, converted to JTS lon/lat internally. */
    public static Point point(double lat, double lon) {
        Point p = FACTORY.createPoint(new Coordinate(lon, lat));
        p.setSRID(SRID);
        return p;
    }

    /** Ordered lat/lon pairs to a line. Used for lane segment geometry. */
    public static LineString line(List<double[]> latLonPairs) {
        Coordinate[] coords = new Coordinate[latLonPairs.size()];
        for (int i = 0; i < latLonPairs.size(); i++) {
            double[] pair = latLonPairs.get(i);
            coords[i] = new Coordinate(pair[1], pair[0]);
        }
        LineString ls = FACTORY.createLineString(coords);
        ls.setSRID(SRID);
        return ls;
    }

    /** Latitude of a point, reading the JTS y ordinate. */
    public static double lat(Point p) {
        return p == null ? 0 : p.getY();
    }

    /** Longitude of a point, reading the JTS x ordinate. */
    public static double lon(Point p) {
        return p == null ? 0 : p.getX();
    }
}
