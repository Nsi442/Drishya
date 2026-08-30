package com.drishya.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on the two background mechanisms this system runs on: the geofence
 * listener reacting to ingest, and the scheduled jobs that recompute ETAs and
 * rebuild the shared history.
 *
 * <p>Neither annotation does anything on its own. Without EnableAsync the
 * geofence listener still runs — inline, on the ingest request thread — which
 * is the failure mode that looks exactly like everything working until the
 * positions table gets busy and ingest latency quietly triples.
 *
 * <p>No executor bean is declared here on purpose. spring.threads.virtual.enabled
 * is set, and Boot then backs @Async with a virtual-thread executor by itself.
 * The work is entirely I/O bound — a spatial query and two writes — so a fixed
 * platform-thread pool would only mean sizing a queue against a load nobody has
 * measured, and on a t3.micro the wrong guess is either wasted memory or a
 * backlog growing invisibly behind ingest.
 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {
}
