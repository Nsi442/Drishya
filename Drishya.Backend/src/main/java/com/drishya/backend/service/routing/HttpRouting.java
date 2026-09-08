package com.drishya.backend.service.routing;

import com.drishya.backend.domain.GeoPoint;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
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
     * Keep every nth point, and always both ends.
     *
     * <p>Evenly rather than by shape: a Douglas-Peucker simplification would
     * keep the corners and is what a mapping library would do, but the distance
     * travels separately and is not recomputed from these points, so the
     * geometry only has to look like the road. Losing a bend is invisible at
     * the zoom this is drawn at.
     */
    static List<GeoPoint> thin(List<GeoPoint> points, int max) {
        if (points.size() <= max) {
            return points;
        }
        int stride = (int) Math.ceil(points.size() / (double) max);
        int last = points.size() - 1;
        List<GeoPoint> out = new ArrayList<>(max + 1);
        int i = 0;
        for (; i < points.size(); i += stride) {
            out.add(points.get(i));
        }
        // Compared by index rather than by value: GeoPoint has no equals(), so
        // a value comparison here would silently be an identity comparison —
        // right by accident today and wrong the moment anyone adds one.
        if (i - stride != last) {
            out.add(points.get(last));
        }
        return out;
    }
}
