-- The feature vector each prediction was actually made from.
--
-- Without this the training export would have to recompute features from
-- today's history, which leaks information the model will not have at serving
-- time: the segment speeds a trip is scored against would already include that
-- trip's own contribution, and every other trip that ran since. The result is a
-- model that looks excellent in backtest and is ordinary in production.
--
-- Storing the vector as it stood at prediction time makes the export a replay
-- rather than a reconstruction, and it is the only version that can honestly be
-- called training data.
--
-- JSONB rather than twelve columns because the feature set is expected to grow;
-- EtaFeatures.NAMES is append-only and the loader refuses any model whose order
-- disagrees, so an added feature is a new key here rather than a migration.
ALTER TABLE eta_predictions ADD COLUMN features jsonb;

COMMENT ON COLUMN eta_predictions.features IS
    'Feature vector as it stood when this prediction was made. Replayed by the '
    'training export; never recomputed.';
