package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * What every routing backend needs and none of them should decide for itself.
 *
 * <p>The timeouts, the proxy handling and the encoding are properties of
 * talking to a free public service over the internet, not of any particular
 * one — and the encoding in particular was learned the hard way, so it must
 * not be something a new backend can forget.
 */
final class HttpRouting {

    private HttpRouting() {
    }

    /**
     * A client bounded on both sides.
     *
     * <p>A slow router must delay a booking by seconds, not hold the request
     * thread until something else times out.
     */
    static RestClient client(long connectTimeoutMs, long readTimeoutMs) {
        HttpClient http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMs))
                // Honour -Dhttps.proxyHost where one is set; harmless where it
                // is not. java.net.http ignores system proxies unless asked.
                .proxy(ProxySelector.getDefault())
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        return RestClient.builder().requestFactory(factory).build();
    }

    /**
     * Ask for it uncompressed, and mean it.
     *
     * <p>Left alone this client advertises gzip, the public router's proxy
     * obliged, and the reply came back labelled gzip with a body that had
     * already been decompressed — so inflating it failed with "ZipException:
     * incorrect header check" and every booking quietly drew a curve instead.
     *
     * <p>It has to be avoided rather than handled: the inflation happens inside
     * the HTTP client while the body is still being read, before any converter
     * and before anything this code could inspect. Not asking for compression
     * is the only lever, and a route is tens of kilobytes fetched once per
     * booking, so nothing is lost by it.
     *
     * <p>Applied here rather than in each backend so a new one cannot be added
     * without it.
     */
    static <T> T get(RestClient client, String url, Class<T> type) {
        return client.get()
                .uri(url)
                .header(HttpHeaders.ACCEPT_ENCODING, "identity")
                .retrieve()
                .body(type);
    }

    /**
     * The same, for a caller that has already built a URI.
     *
     * <p>A URI is passed through untouched, where a String is treated as a
     * template and encoded again — which is how a percent-encoded pipe became
     * %257C and BRouter was asked for coordinates it could not split.
     */
    static <T> T get(RestClient client, java.net.URI uri, Class<T> type) {
        return client.get()
                .uri(uri)
                .header(HttpHeaders.ACCEPT_ENCODING, "identity")
                .retrieve()
                .body(type);
    }

    /**
     * Reduce a road geometry to at most {@code max} points, keeping its shape.
     *
     * <p><b>This replaced an even-stride thinner, and the difference is the
     * whole accuracy of the drawn road.</b> Keeping every nth point treats a
     * hairpin and a motorway straight as equally disposable, so it deletes the
     * corners — the only points that carry the shape — and keeps redundant ones
     * on a straight where any two would do.
     *
     * <p>Ramer-Douglas-Peucker instead: it keeps the points that the line
     * cannot be drawn without, and drops the ones that already sit on it. The
     * tolerance is a real distance, so "no point moves more than 25 m from the
     * road" is a promise the output actually keeps.
     *
     * <p>The tolerance doubles until the result fits {@code max}, rather than
     * the cap being enforced by a second, blunter pass. A long lane therefore
     * degrades by getting geometrically coarser everywhere, which is even —
     * not by losing whole junctions while a motorway keeps points it does not
     * need.
     */
    static List<GeoPoint> simplify(List<GeoPoint> points, int max) {
        if (points.size() <= max) {
            return points;
        }
        // Binary search for the FINEST tolerance that still fits, rather than
        // the first one that does.
        //
        // Doubling until it fit was the obvious version and it was measurably
        // worse than the even-stride thinner it replaced: it stopped at the
        // first tolerance under the cap, which on one road left 300 points of
        // an 800 budget unspent and the line 15 m off where 5 m was available.
        // Simplifying is not the goal — spending the whole budget on the points
        // that matter is.
        List<GeoPoint> best = null;
        double low = 0, high = MAX_TOLERANCE_M;
        for (int i = 0; i < TOLERANCE_STEPS; i++) {
            double mid = (low + high) / 2;
            List<GeoPoint> candidate = douglasPeucker(points, mid);
            if (candidate.size() <= max) {
                best = candidate;   // fits; try to keep more detail
                high = mid;
            } else {
                low = mid;          // too many; loosen
            }
        }
        if (best != null) {
            return best;
        }
        List<GeoPoint> out = douglasPeucker(points, MAX_TOLERANCE_M);
        // Past the ceiling the shape is beyond saving by tolerance alone; take
        // an even stride of what the loosest pass left, which is still chosen
        // from the points that mattered most rather than from all of them.
        return stride(out, max);
    }

    /** Past this the line is no longer a road, so stop widening. */
    private static final double MAX_TOLERANCE_M = 2000;

    /**
     * Bisection steps. 24 narrows 0-2000 m to under a tenth of a millimetre,
     * which is far past the point where another step changes the output; the
     * cost is 24 passes over the geometry once, at booking.
     */
    private static final int TOLERANCE_STEPS = 24;

    private static List<GeoPoint> douglasPeucker(List<GeoPoint> pts, double toleranceM) {
        if (pts.size() < 3) {
            return pts;
        }
        boolean[] keep = new boolean[pts.size()];
        keep[0] = true;
        keep[pts.size() - 1] = true;
        // Iterative rather than recursive: a full OSRM geometry runs to tens of
        // thousands of points, and recursion there is a stack overflow on a
        // long lane — the exact case this exists to handle.
        Deque<int[]> work = new ArrayDeque<>();
        work.push(new int[]{0, pts.size() - 1});
        while (!work.isEmpty()) {
            int[] span = work.pop();
            int first = span[0], last = span[1];
            double worst = -1;
            int worstAt = -1;
            for (int i = first + 1; i < last; i++) {
                double d = perpendicularMetres(pts.get(i), pts.get(first), pts.get(last));
                if (d > worst) {
                    worst = d;
                    worstAt = i;
                }
            }
            if (worstAt > 0 && worst > toleranceM) {
                keep[worstAt] = true;
                work.push(new int[]{first, worstAt});
                work.push(new int[]{worstAt, last});
            }
        }
        List<GeoPoint> out = new ArrayList<>();
        for (int i = 0; i < pts.size(); i++) {
            if (keep[i]) {
                out.add(pts.get(i));
            }
        }
        return out;
    }

    /**
     * How far {@code p} sits from the segment {@code a}-{@code b}, in metres.
     *
     * <p>Flat-earth within a segment, which at these lengths is right to well
     * under a metre, and longitude is scaled by cos(latitude) so a degree east
     * is not treated as a degree north.
     */
    private static double perpendicularMetres(GeoPoint p, GeoPoint a, GeoPoint b) {
        double mPerDegLat = 111_320.0;
        double midLat = Math.toRadians((a.getLat() + b.getLat()) / 2);
        double mPerDegLon = mPerDegLat * Math.cos(midLat);

        double px = (p.getLng() - a.getLng()) * mPerDegLon;
        double py = (p.getLat() - a.getLat()) * mPerDegLat;
        double bx = (b.getLng() - a.getLng()) * mPerDegLon;
        double by = (b.getLat() - a.getLat()) * mPerDegLat;

        double len2 = bx * bx + by * by;
        if (len2 == 0) {
            return Math.hypot(px, py);
        }
        // Clamped, so a point beyond either end measures to the end itself
        // rather than to the infinite line through it.
        double t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
        return Math.hypot(px - t * bx, py - t * by);
    }

    /** Every nth point, both ends always kept. The last resort, not the plan. */
    private static List<GeoPoint> stride(List<GeoPoint> points, int max) {
        if (points.size() <= max) {
            return points;
        }
        int step = (int) Math.ceil(points.size() / (double) max);
        int last = points.size() - 1;
        List<GeoPoint> out = new ArrayList<>(max + 1);
        int i = 0;
        for (; i < points.size(); i += step) {
            out.add(points.get(i));
        }
        if (i - step != last) {
            out.add(points.get(last));
        }
        return out;
    }
}
