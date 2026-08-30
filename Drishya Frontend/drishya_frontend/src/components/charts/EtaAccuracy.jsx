import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { trips as tripService } from '../../services/index.js'
import { Card, CardBody, CardHeader, Skeleton } from '../ui/index.js'
import './charts.css'

/**
 * How wrong the ETA engine has actually been.
 *
 * Deliberately unflattering, and deliberately prominent. A product whose central
 * claim is "we can tell you when the vehicle will arrive" should be willing to
 * publish how often it was wrong — and if this number is embarrassing, that is
 * information rather than a reason to hide the panel.
 *
 * Mean **absolute** error, per lane. A model twenty minutes optimistic half the
 * time and twenty minutes pessimistic the other half has a signed error of zero
 * and is worthless; averaging the sign away would make the system look perfect
 * exactly when it is not. And per lane rather than one figure, because a single
 * number hides one badly predicted corridor inside five good ones.
 */
export default function EtaAccuracy({ pollMs = 30_000 }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await tripService.getEtaAccuracy()
        if (alive) {
          setData(res)
          setError(null)
        }
      } catch (e) {
        if (alive) setError(e.message)
      }
    }

    load()
    const timer = setInterval(load, pollMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [pollMs])

  if (error) return <Card><CardBody><p className="chart-error">{error}</p></CardBody></Card>
  if (!data) return <Card><CardBody><Skeleton height={220} /></CardBody></Card>

  const lanes = data.byLane ?? []

  return (
    <Card>
      <CardHeader
        title="Prediction accuracy"
        subtitle={`Mean absolute error against actual dock-in · model ${data.modelVersion}`}
      />
      <CardBody>
        {/* A model fitted on generated data must never be mistaken for a
            measured result. The API reports this flag precisely so the UI can
            say it out loud rather than showing a number that looks earned. */}
        {data.trainedOnSyntheticData && (
          <p className="chart-warning">
            This model was trained on synthetic data. These figures describe the
            generator, not the road.
          </p>
        )}

        {/* "No data yet" and "perfectly accurate" must never look the same. */}
        {data.note ? (
          <p className="chart-empty">{data.note}</p>
        ) : (
          <>
            <div className="chart-headline">
              <span className="chart-headline-value">
                {data.meanAbsoluteErrorMinutes}
                <span className="chart-headline-unit"> min</span>
              </span>
              <span className="chart-headline-label">
                average error across {data.scoredPredictions} scored predictions
              </span>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={lanes} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lane" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  label={{ value: 'min', angle: -90, position: 'insideLeft', offset: 10 }}
                />
                <Tooltip
                  formatter={(value, _name, entry) => [
                    `${value} min over ${entry.payload.samples} predictions`,
                    'Mean absolute error',
                  ]}
                />
                <Bar dataKey="meanAbsoluteErrorMinutes" radius={[4, 4, 0, 0]}>
                  {lanes.map((lane) => (
                    // Coloured by how much it matters operationally, not by a
                    // gradient: under 15 minutes a dispatcher does nothing,
                    // over 45 the booked slot is in question.
                    <Cell
                      key={lane.lane}
                      fill={
                        lane.meanAbsoluteErrorMinutes <= 15
                          ? 'var(--success)'
                          : lane.meanAbsoluteErrorMinutes <= 45
                            ? 'var(--warn)'
                            : 'var(--danger)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <p className="chart-footnote">
              Every prediction is stored when it is made and scored when the
              vehicle docks, so this is measured rather than claimed.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
