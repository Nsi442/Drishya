#!/usr/bin/env python3
"""
Generates plausible historical trips so the training pipeline is demonstrable
before real data exists.

    python generate_synthetic_trips.py --rows 4000 --out data/synthetic.csv
    python train.py --csv data/synthetic.csv --synthetic

*** READ THIS ***

Every row this writes is invented. It is shaped to look like Indian
vendor-to-fulfilment-centre road freight, and it is not evidence of anything.

Its only legitimate use is proving the plumbing runs end to end — export,
train, quantile fit, ONNX conversion, feature-order check, load, serve, fall
back — before a single real trip has docked. An accuracy number measured on this
data describes the generator below, not any road, and quoting one as validated
performance would be straightforwardly dishonest.

`train.py --synthetic` records `trainedOnSyntheticData: true` inside
`models/features.json`, so a model trained this way carries the label with it
and cannot be quietly mistaken for a real one later.

The generator deliberately builds in the same biases the heuristic is known to
have, so there is something real for the model to correct:

  * the heuristic underestimates during the morning and evening peaks, because
    a mean speed for the hour understates how badly a jam actually bites
  * it underestimates at small sites, where a queue has nowhere to absorb into
  * it is roughly unbiased overnight on open highway

A model that cannot recover those three effects from this data has a bug in the
pipeline, which is exactly what this file is for.
"""

from __future__ import annotations

import argparse
import csv
import math
import random
import sys
from pathlib import Path

# Must match EtaFeatures.NAMES in the Java, in order. train.py reads the order
# from the header it finds, so a mismatch here produces a model the Java loader
# will refuse — which is the intended failure, loudly, at startup.
FEATURES = [
    "remainingDistanceM",
    "remainingSegments",
    "hourOfDay",
    "isWeekend",
    "meanSpeedAheadKmph",
    "minSamplesAhead",
    "observedSpeedKmph",
    "elapsedMinutes",
    "predictedQueueMinutes",
    "dockSamples",
    "dockCount",
    "heuristicMinutes",
]


def peak_factor(hour: int, weekend: bool) -> float:
    """How much worse than the hourly mean the road actually is."""
    if weekend:
        return 1.0
    if 8 <= hour <= 11:
        return 1.35          # morning peak, badly understated by an hour mean
    if 17 <= hour <= 20:
        return 1.28          # evening peak
    if hour <= 5 or hour >= 22:
        return 0.95          # overnight, slightly optimistic in the vehicle's favour
    return 1.05


def generate_row(rng: random.Random) -> dict:
    hour = rng.randint(0, 23)
    weekend = 1 if rng.random() < 2 / 7 else 0

    remaining_km = rng.uniform(3, 240)
    remaining_m = remaining_km * 1000
    segments = max(1, min(4, math.ceil(remaining_km / 60)))

    # What the pooled history believes about the road ahead.
    base_speed = rng.uniform(22, 78)
    samples_ahead = rng.choice([2, 3, 5, 8, 14, 22, 40, 60])
    observed = max(4.0, rng.gauss(base_speed, base_speed * 0.2))

    dock_count = rng.choice([6, 7, 8, 10])
    dock_samples = rng.choice([3, 6, 9, 14, 22, 35])
    queue_minutes = max(2.0, rng.gauss(60 if 9 <= hour <= 12 else 25, 12))
    queue_minutes *= 10 / dock_count

    elapsed = rng.uniform(0, 300)

    # The heuristic, computed the way the Java does: distance over the mean
    # speed for the hour, plus the pooled queue.
    travel_minutes = remaining_km / base_speed * 60
    heuristic = travel_minutes + queue_minutes

    # What actually happened. The heuristic's known biases, plus noise that
    # shrinks as the evidence behind the means grows.
    actual_travel = travel_minutes * peak_factor(hour, bool(weekend))
    actual_queue = queue_minutes * (1.0 + (0.35 if dock_count <= 7 else 0.0))
    noise_scale = 0.30 / math.sqrt(min(samples_ahead, dock_samples))
    actual = (actual_travel + actual_queue) * rng.gauss(1.0, noise_scale)
    actual = max(1.0, actual)

    return {
        "remainingDistanceM": round(remaining_m, 2),
        "remainingSegments": segments,
        "hourOfDay": hour,
        "isWeekend": weekend,
        "meanSpeedAheadKmph": round(base_speed, 2),
        "minSamplesAhead": samples_ahead,
        "observedSpeedKmph": round(observed, 2),
        "elapsedMinutes": round(elapsed, 1),
        "predictedQueueMinutes": round(queue_minutes, 2),
        "dockSamples": dock_samples,
        "dockCount": dock_count,
        "heuristicMinutes": round(heuristic, 2),
        "actual_minutes": round(actual, 2),
        "residual_minutes": round(actual - heuristic, 2),
        "model_version": "synthetic",
        "made_at": 0,
        "trip_id": "SYNTHETIC",
    }


def main() -> None:
    here = Path(__file__).parent
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rows", type=int, default=4000)
    p.add_argument("--out", type=Path, default=here / "data" / "synthetic.csv")
    p.add_argument("--seed", type=int, default=20260826,
                   help="Fixed so a run is reproducible.")
    args = p.parse_args()

    rng = random.Random(args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    columns = FEATURES + ["actual_minutes", "residual_minutes",
                          "model_version", "made_at", "trip_id"]

    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        # made_at increments so train.py's chronological split has something to
        # sort on, rather than silently splitting an unordered frame.
        for i in range(args.rows):
            row = generate_row(rng)
            row["made_at"] = 1_700_000_000_000 + i * 60_000
            writer.writerow(row)

    print(f"Wrote {args.rows} SYNTHETIC rows to {args.out}")
    print()
    print("  These are invented. Train with --synthetic so the model carries")
    print("  the label, and never quote accuracy from them as a real result.")


if __name__ == "__main__":
    main()
