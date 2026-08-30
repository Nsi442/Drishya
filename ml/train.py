#!/usr/bin/env python3
"""
Trains the ETA correction model.

Run
---
    # export from a running backend, then train
    curl -H "X-Service-Token: $DRISHYA_SERVICE_TOKEN" \
         http://localhost:8080/api/v1/internal/training-data > data/training.csv
    python train.py --csv data/training.csv

    # or, before any real trips exist
    python generate_synthetic_trips.py --rows 4000 --out data/synthetic.csv
    python train.py --csv data/synthetic.csv --synthetic

What this trains, and why it is not what you might expect
---------------------------------------------------------
The label is the **residual of the heuristic** — `actual_minutes - heuristic_minutes`
— not the arrival time. The Java heuristic already sums segment distances over
pooled lane speeds and adds a pooled dock queue; it is a decent estimator on its
own. Asking a model to relearn travel time from scratch would need hundreds of
thousands of trips and would throw away everything the arithmetic already knows.

Asking it only "where is that arithmetic systematically wrong?" is a far smaller
question. It is answerable on a few hundred trips, and it fails gracefully: a
model that has learned nothing useful predicts a correction near zero, and the
served estimate quietly collapses back to the heuristic instead of to noise.

Three models are fitted, at quantiles 0.1, 0.5 and 0.9. A dispatcher deciding
whether to rebook a slot needs the worst case, not the midpoint — "16:40, and it
could be 17:25" supports a decision that a bare "16:40" does not.

Feature order
-------------
The order is taken from the CSV header, which the Java `EtaFeatures.NAMES` array
wrote. It is copied verbatim into `models/features.json`, and the Java loader
refuses to serve any model whose recorded order disagrees with the order it is
about to feed in. There is deliberately **no feature engineering in this file**:
every column arrives ready-made from the one Java `FeatureBuilder` that also
serves live predictions. A train/serve mismatch throws no error, it just makes
every prediction quietly wrong, and one implementation is the only real defence.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    import pandas as pd
    import lightgbm as lgb
except ImportError as e:
    sys.exit(f"Missing a dependency ({e.name}). Run:  pip install -r requirements.txt")

# The label and bookkeeping columns the export adds after the features.
NON_FEATURE_COLUMNS = {
    "actual_minutes",
    "residual_minutes",
    "model_version",
    "made_at",
    "trip_id",
}

QUANTILES = {"q10": 0.1, "q50": 0.5, "q90": 0.9}


def load(csv_path: Path, min_rows: int) -> tuple[pd.DataFrame, list[str]]:
    if not csv_path.exists():
        sys.exit(f"No such file: {csv_path}")

    df = pd.read_csv(csv_path)
    if df.empty:
        sys.exit(f"{csv_path} has no rows. Has any trip actually docked yet?")

    features = [c for c in df.columns if c not in NON_FEATURE_COLUMNS]
    if "residual_minutes" not in df.columns:
        sys.exit("The CSV has no residual_minutes column — is it really the "
                 "training export from /api/v1/internal/training-data?")

    if len(df) < min_rows:
        sys.exit(
            f"Only {len(df)} rows. Refusing to train on this little.\n"
            f"A model fitted on a handful of trips will look excellent in "
            f"backtest and be worse than the heuristic in production, which is "
            f"the one outcome worth actively preventing.\n"
            f"Either collect more trips, or use generate_synthetic_trips.py and "
            f"pass --synthetic so the output is labelled honestly.\n"
            f"Override with --min-rows if you know what you are doing."
        )

    return df, features


def split(df: pd.DataFrame, features: list[str], holdout: float):
    """
    Split by time, not at random.

    A random split lets the model see next Tuesday while being tested on last
    Tuesday. Traffic is strongly autocorrelated, so that leaks and produces a
    held-out score that cannot be reproduced in production. Sorting by when the
    prediction was made and cutting at the end is the honest version.
    """
    if "made_at" in df.columns:
        df = df.sort_values("made_at")
    cut = int(len(df) * (1 - holdout))
    train, test = df.iloc[:cut], df.iloc[cut:]
    return (train[features], train["residual_minutes"],
            test[features], test["residual_minutes"], test)


def fit_quantile(x_train, y_train, alpha: float, rounds: int) -> lgb.Booster:
    params = {
        "objective": "quantile",
        "alpha": alpha,
        "metric": "quantile",
        # Deliberately small. The dataset is hundreds to low thousands of rows;
        # a deep forest memorises it and generalises to nothing.
        "num_leaves": 15,
        "min_data_in_leaf": 20,
        "learning_rate": 0.05,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "verbose": -1,
        "seed": 42,
    }
    return lgb.train(params, lgb.Dataset(x_train, label=y_train), num_boost_round=rounds)


def report(models, x_test, y_test, test_df, features) -> float:
    """
    Scores the model against the heuristic it is meant to improve on.

    The comparison is the only number that matters. A model with a respectable
    MAE that is nonetheless worse than the arithmetic it replaced is a
    regression dressed up as progress.
    """
    heuristic = test_df["heuristicMinutes"].to_numpy()
    actual = test_df["actual_minutes"].to_numpy()

    predicted_residual = models["q50"].predict(x_test)
    corrected = heuristic + predicted_residual

    mae_model = float(np.mean(np.abs(corrected - actual)))
    mae_heuristic = float(np.mean(np.abs(heuristic - actual)))

    low = heuristic + models["q10"].predict(x_test)
    high = heuristic + models["q90"].predict(x_test)
    covered = float(np.mean((actual >= low) & (actual <= high)))

    print()
    print(f"  Held-out rows            {len(x_test)}")
    print(f"  Heuristic alone  MAE     {mae_heuristic:7.1f} min")
    print(f"  With correction  MAE     {mae_model:7.1f} min")
    delta = mae_heuristic - mae_model
    verdict = "better" if delta > 0 else "WORSE"
    print(f"  Improvement              {delta:7.1f} min  ({verdict})")
    print(f"  80% band coverage        {covered:7.1%}   (target 80%)")

    if delta <= 0:
        print()
        print("  The correction does not beat the heuristic on held-out data.")
        print("  Do not deploy this model. Leaving models/eta.onnx absent means")
        print("  the backend serves the heuristic, which is the better estimator")
        print("  here — that fallback is the whole reason the seam exists.")

    return delta


def export(models, features: list[str], out_dir: Path, synthetic: bool, delta: float) -> None:
    try:
        import onnxmltools
        from onnxmltools.convert.common.data_types import FloatTensorType
    except ImportError:
        sys.exit("Missing onnxmltools. Run:  pip install -r requirements.txt")

    out_dir.mkdir(parents=True, exist_ok=True)
    initial_type = [("input", FloatTensorType([None, len(features)]))]

    # Three files rather than one graph with three heads. Merging separately
    # fitted boosters into a single ONNX graph is fiddly and opaque; three files
    # are independently inspectable and independently replaceable, and the Java
    # loader treats the median as required and the other two as optional.
    written = []
    for name, model in models.items():
        onnx_model = onnxmltools.convert_lightgbm(model, initial_types=initial_type)
        path = out_dir / ("eta.onnx" if name == "q50" else f"eta_{name}.onnx")
        onnxmltools.utils.save_model(onnx_model, str(path))
        written.append(path.name)

    # The contract the Java loader checks on startup.
    (out_dir / "features.json").write_text(json.dumps({
        "features": features,
        "label": "residual_minutes",
        "note": "Order is load-bearing. The Java loader refuses any model whose "
                "order disagrees with EtaFeatures.NAMES.",
        "trainedOnSyntheticData": synthetic,
        "heldOutImprovementMinutes": round(delta, 2),
    }, indent=2), encoding="utf-8")

    print()
    print(f"  Wrote {', '.join(written)} and features.json to {out_dir}")
    if synthetic:
        print()
        print("  *** TRAINED ON SYNTHETIC DATA ***")
        print("  features.json records trainedOnSyntheticData: true. Any accuracy")
        print("  figure from this model describes the generator, not the road.")
        print("  Never present it as validated performance.")


def main() -> None:
    here = Path(__file__).parent
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", type=Path, default=here / "data" / "training.csv")
    p.add_argument("--out", type=Path, default=here.parent / "Drishya.Backend" / "models")
    p.add_argument("--holdout", type=float, default=0.2)
    p.add_argument("--rounds", type=int, default=300)
    p.add_argument("--min-rows", type=int, default=200)
    p.add_argument("--synthetic", action="store_true",
                   help="Mark the output as trained on generated data. Always pass "
                        "this when the CSV came from generate_synthetic_trips.py.")
    args = p.parse_args()

    df, features = load(args.csv, args.min_rows)
    print(f"Training on {len(df)} rows, {len(features)} features")
    print(f"Feature order: {', '.join(features)}")

    x_train, y_train, x_test, y_test, test_df = split(df, features, args.holdout)

    models = {name: fit_quantile(x_train, y_train, alpha, args.rounds)
              for name, alpha in QUANTILES.items()}

    delta = report(models, x_test, y_test, test_df, features)
    export(models, features, args.out, args.synthetic, delta)


if __name__ == "__main__":
    main()
