package com.drishya.backend.seed;

import java.util.List;

/**
 * The same Lehmer generator the frontend's mock layer used, ported so the seeded
 * dataset is reproducible: every restart rebuilds an identical database, which
 * is what makes screenshots, demos and bug reports comparable.
 *
 * <p>Multiplier 16807 modulo 2^31-1 — MINSTD. Not remotely suitable for
 * anything security-related, and never used for anything but fixture data.
 */
public final class Rng {

    private static final long MODULUS = 2147483647L;
    private static final long MULTIPLIER = 16807L;

    private long value;

    public Rng(long seed) {
        long v = seed % MODULUS;
        if (v <= 0) {
            v += MODULUS - 1;
        }
        this.value = v;
    }

    /** Uniform in [0, 1). */
    public double next() {
        value = (value * MULTIPLIER) % MODULUS;
        return (value - 1) / (double) (MODULUS - 1);
    }

    /** Uniform integer in [min, max], both inclusive. */
    public int nextInt(int min, int max) {
        return (int) Math.floor(next() * (max - min + 1)) + min;
    }

    public <T> T pick(List<T> items) {
        return items.get((int) Math.floor(next() * items.size()));
    }

    public <T> T pick(T[] items) {
        return items[(int) Math.floor(next() * items.length)];
    }

    public boolean chance(double probability) {
        return next() < probability;
    }
}
