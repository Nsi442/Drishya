import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { cn } from '../../lib/cn.js'
import { formatNumber } from '../../lib/format.js'
import Icon from '../ui/Icon.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import './charts.css'

// Series colours are read from CSS variables, so a theme switch repaints the
// charts without React re-rendering anything. Fixed order — series 1 is always
// teal, series 4 always red, whatever a filter leaves standing.
const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

const AXIS = {
  tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  axisLine: false,
  tickLine: false,
}

const GRID = { stroke: 'var(--chart-grid)', strokeDasharray: '0', vertical: false }

// One tooltip for every chart in the product. Values wear text tokens; the
// series colour appears only as a swatch beside the label.
function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <p className="chart-tip-label">{labelFormatter ? labelFormatter(label) : label}</p>
      <ul className="chart-tip-list">
        {payload
          .filter((row) => row.value !== null && row.value !== undefined)
          .map((row) => (
            <li key={row.dataKey}>
              <span className="chart-tip-swatch" style={{ background: row.color ?? row.fill }} aria-hidden="true" />
              <span className="chart-tip-name">{row.name}</span>
              <span className="chart-tip-value">{formatter ? formatter(row.value, row.dataKey) : formatNumber(row.value)}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}

function ChartLegend({ payload }) {
  if (!payload?.length) return null
  return (
    <ul className="chart-legend">
      {payload.map((row) => (
        <li key={row.value}>
          <span className="chart-legend-swatch" style={{ background: row.color }} aria-hidden="true" />
          {row.value}
        </li>
      ))}
    </ul>
  )
}

// Wraps every chart with its title, its loading and empty states, and an
// optional table view — so identity is never carried by colour alone.
export function ChartFrame({ title, subtitle, actions, height = 240, loading, isEmpty, emptyText, children, table, className }) {
  const [showTable, setShowTable] = useState(false)

  return (
    <section className={cn('card', className)}>
      <header className="card-header">
        <div className="grow">
          <h2 className="card-title">{title}</h2>
          {subtitle ? <p className="card-sub">{subtitle}</p> : null}
        </div>
        <div className="row gap-6">
          {actions}
          {table ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowTable((s) => !s)}
              aria-pressed={showTable}
              aria-label={showTable ? 'Show chart' : 'Show data as a table'}
              title={showTable ? 'Show chart' : 'Show data as a table'}
            >
              <Icon name={showTable ? 'chart' : 'list'} size={15} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="card-body">
        {loading ? (
          <Skeleton height={height} radius="var(--radius-sm)" />
        ) : isEmpty ? (
          <EmptyState icon="chart" title="Nothing to plot" description={emptyText ?? 'No records fall inside the selected range.'} />
        ) : showTable ? (
          <div className="scroll-x">{table}</div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </section>
  )
}

// --- line ---------------------------------------------------------------
// One measure over time. Never two y-scales: a second measure of a different
// unit gets its own chart.
export function TrendLine({ data, xKey = 'label', series, height = 240, yFormatter, tipFormatter, domain }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -14 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...AXIS} width={46} tickFormatter={yFormatter} domain={domain} />
        <Tooltip content={<ChartTooltip formatter={tipFormatter} />} cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }} />
        {series.length > 1 ? <Legend content={<ChartLegend />} verticalAlign="bottom" height={28} /> : null}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES[i]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--chart-surface)' }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function TrendArea({ data, xKey = 'label', series, height = 240, yFormatter, tipFormatter }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -14 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...AXIS} width={46} tickFormatter={yFormatter} />
        <Tooltip content={<ChartTooltip formatter={tipFormatter} />} cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }} />
        {series.length > 1 ? <Legend content={<ChartLegend />} verticalAlign="bottom" height={28} /> : null}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={SERIES[i]}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// --- bars ---------------------------------------------------------------
// Stacked segments carry a 2px surface-coloured stroke, which reads as a gap
// and keeps two adjacent fills from merging into one block.
export function VolumeBars({ data, xKey = 'label', series, height = 240, stacked = false, yFormatter, tipFormatter, layout = 'horizontal' }) {
  const vertical = layout === 'vertical'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={vertical ? { top: 4, right: 16, bottom: 0, left: 8 } : { top: 6, right: 10, bottom: 0, left: -14 }}
        barCategoryGap={vertical ? '22%' : '28%'}
      >
        <CartesianGrid {...GRID} vertical={vertical} horizontal={!vertical} />
        {vertical ? (
          <>
            <XAxis type="number" {...AXIS} tickFormatter={yFormatter} />
            <YAxis type="category" dataKey={xKey} {...AXIS} width={150} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...AXIS} width={46} tickFormatter={yFormatter} />
          </>
        )}
        <Tooltip content={<ChartTooltip formatter={tipFormatter} />} cursor={{ fill: 'var(--surface-hover)' }} />
        {series.length > 1 ? <Legend content={<ChartLegend />} verticalAlign="bottom" height={28} /> : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? 'a' : undefined}
            fill={s.color ?? SERIES[i]}
            stroke="var(--chart-surface)"
            strokeWidth={stacked ? 2 : 0}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={vertical ? 20 : 42}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- donut --------------------------------------------------------------
// Parts of one whole, with the total called out in the middle. Segments are
// always labelled in the legend beside it — never colour alone.
export function DonutChart({ data, height = 240, nameKey = 'name', valueKey = 'value', centreLabel, centreValue, tipFormatter }) {
  const total = data.reduce((sum, d) => sum + d[valueKey], 0)

  return (
    <div className="donut-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--chart-surface)"
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry, i) => (
              <Cell key={entry[nameKey]} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={tipFormatter} />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="donut-centre" aria-hidden="true">
        <span className="donut-centre-value">{centreValue ?? formatNumber(total)}</span>
        <span className="donut-centre-label">{centreLabel ?? 'total'}</span>
      </div>
    </div>
  )
}

// Legend rendered outside the donut so long reason strings stay readable.
export function DonutLegend({ data, nameKey = 'name', valueKey = 'value' }) {
  const total = data.reduce((sum, d) => sum + d[valueKey], 0) || 1
  return (
    <ul className="donut-legend">
      {data.map((entry, i) => (
        <li key={entry[nameKey]}>
          <span className="chart-legend-swatch" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />
          <span className="grow truncate">{entry[nameKey]}</span>
          <span className="donut-legend-value">{entry[valueKey]}</span>
          <span className="donut-legend-pct">{Math.round((entry[valueKey] / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  )
}

// --- sparkline ----------------------------------------------------------
// Sensor traces on the shipment detail page. No axes: the shape is the point,
// and the current value is printed beside it.
export function Sparkline({ data, dataKey = 'value', height = 44, tone = 'var(--chart-1)', threshold }) {
  if (!data?.length) return <div className="spark-empty">No readings</div>

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}-${tone.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity={0.28} />
            <stop offset="100%" stopColor={tone} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Tooltip
          content={<ChartTooltip labelFormatter={() => ''} />}
          cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={tone}
          strokeWidth={1.75}
          fill={`url(#spark-${dataKey}-${tone.replace(/[^a-z0-9]/gi, '')})`}
          dot={false}
          isAnimationActive={false}
        />
        {threshold !== undefined ? <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} /> : null}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// --- heatmap ------------------------------------------------------------
// Magnitude by weekday × hour. Sequential single hue, light to dark — the
// steps are a ramp, never a rainbow.
export function Heatmap({ data, rows, columns, valueKey = 'value', rowKey = 'day', colKey = 'hour', formatColumn, caption }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]))
  const lookup = new Map(data.map((d) => [`${d[rowKey]}:${d[colKey]}`, d[valueKey]]))

  const step = (value) => {
    if (!value) return 'var(--seq-0)'
    const ratio = value / max
    if (ratio <= 0.17) return 'var(--seq-1)'
    if (ratio <= 0.34) return 'var(--seq-2)'
    if (ratio <= 0.51) return 'var(--seq-3)'
    if (ratio <= 0.68) return 'var(--seq-4)'
    if (ratio <= 0.85) return 'var(--seq-5)'
    return 'var(--seq-6)'
  }

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <table className="heatmap-table">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              <th scope="col" className="heatmap-corner">
                <span className="sr-only">Day</span>
              </th>
              {columns.map((c) => (
                <th key={c} scope="col" className="heatmap-col-head">
                  {formatColumn ? formatColumn(c) : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row" className="heatmap-row-head">
                  {r}
                </th>
                {columns.map((c) => {
                  const value = lookup.get(`${r}:${c}`) ?? 0
                  return (
                    <td key={c} className="heatmap-cell-wrap">
                      <span
                        className="heatmap-cell"
                        style={{ background: step(value) }}
                        title={`${r} ${formatColumn ? formatColumn(c) : c} — ${value} booking${value === 1 ? '' : 's'}`}
                      >
                        <span className="sr-only">{value}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="heatmap-key">
        <span className="t-xs c-muted">Fewer</span>
        {['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)'].map((c) => (
          <span key={c} className="heatmap-key-swatch" style={{ background: c }} />
        ))}
        <span className="t-xs c-muted">More ({max})</span>
      </div>
    </div>
  )
}

// A horizontal magnitude bar used inside table rows — cheaper to scan than a
// number alone when comparing rows.
export function MiniBar({ value, max, tone = 'var(--chart-1)', label }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <span className="minibar" title={label}>
      <span className="minibar-track">
        <span className="minibar-fill" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span className="minibar-value">{label ?? value}</span>
    </span>
  )
}
