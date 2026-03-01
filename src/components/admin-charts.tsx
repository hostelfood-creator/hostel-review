'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp, faArrowDown, faMinus } from '@fortawesome/free-solid-svg-icons'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg, #fff)',
  border: '1px solid var(--tooltip-border, #e4e4e7)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'var(--tooltip-color, #18181b)',
}

const AXIS_TICK = { fill: '#A1A1AA', fontSize: 11 }
const AXIS_LINE = { stroke: 'rgba(161,161,170,0.15)' }
const GRID_STROKE = 'rgba(161,161,170,0.15)'

// --- Charts Row (Line + Bar) ---

export interface ChartsRowProps {
  dailyChartData: { date: string; avgRating: number; count: number }[]
  mealChartData: { mealType: string; avgRating: number; count: number; name: string }[]
}

export function ChartsRow({ dailyChartData, mealChartData }: ChartsRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Rating Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                <YAxis domain={[0, 5]} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line
                  type="monotone"
                  dataKey="avgRating"
                  stroke="#D4920B"
                  strokeWidth={2}
                  dot={{ fill: '#D4920B', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              No data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Meal Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {mealChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={mealChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                <YAxis domain={[0, 5]} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="avgRating" fill="#D4920B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
              No data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- Sentiment Pie Chart ---

export interface SentimentChartProps {
  sentimentData: { name: string; value: number; color: string }[]
}

export function SentimentChart({ sentimentData }: SentimentChartProps) {
  if (sentimentData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No sentiment data
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={sentimentData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {sentimentData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        {sentimentData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-muted-foreground">{d.name} ({d.value})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Rating Heatmap (Day-of-Week × Meal) ---

export interface HeatmapProps {
  data: { day: string; breakfast: number; lunch: number; snacks: number; dinner: number }[]
}

const HEATMAP_MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const
const HEATMAP_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

function ratingColor(value: number): string {
  if (value === 0) return 'bg-muted/30'
  if (value >= 4.5) return 'bg-green-500 text-white'
  if (value >= 3.5) return 'bg-green-400/70 text-white'
  if (value >= 2.5) return 'bg-amber-400/70 text-black'
  if (value >= 1.5) return 'bg-orange-400/70 text-white'
  return 'bg-red-500 text-white'
}

export function RatingHeatmap({ data }: HeatmapProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No heatmap data
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left px-2 py-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider w-12">Day</th>
            {HEATMAP_MEALS.map((meal) => (
              <th key={meal} className="text-center px-2 py-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                {HEATMAP_LABELS[meal]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.day}>
              <td className="px-2 py-1 font-medium text-foreground text-xs">{row.day}</td>
              {HEATMAP_MEALS.map((meal) => {
                const val = row[meal] as number
                return (
                  <td key={meal} className="px-1 py-1 text-center">
                    <div className={`rounded-md px-2 py-1.5 font-semibold text-xs transition-colors ${ratingColor(val)}`}>
                      {val > 0 ? val.toFixed(1) : '—'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 justify-center text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> &lt;2</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400/70 inline-block" /> 2-3</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400/70 inline-block" /> 3-3.5</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400/70 inline-block" /> 3.5-4.5</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> 4.5+</span>
      </div>
    </div>
  )
}

// --- Week-over-Week Comparison Cards ---

export interface WeekOverWeekProps {
  thisWeek: { reviews: number; avgRating: number; positiveRate: number }
  lastWeek: { reviews: number; avgRating: number; positiveRate: number }
}

function DeltaIndicator({ current, previous, suffix = '', decimals = 0 }: { current: number; previous: number; suffix?: string; decimals?: number }) {
  const diff = current - previous
  const isPositive = diff > 0
  const isNeutral = diff === 0 || (previous === 0 && current === 0)

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isNeutral ? 'text-muted-foreground' : isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {!isNeutral && (
        <FontAwesomeIcon
          icon={isPositive ? faArrowUp : faArrowDown}
          className="w-2.5 h-2.5"
        />
      )}
      {isNeutral && <FontAwesomeIcon icon={faMinus} className="w-2.5 h-2.5" />}
      {Math.abs(diff).toFixed(decimals)}{suffix}
    </span>
  )
}

export function WeekOverWeekCards({ thisWeek, lastWeek }: WeekOverWeekProps) {
  const items = [
    { label: 'Reviews', current: thisWeek.reviews, previous: lastWeek.reviews },
    { label: 'Avg Rating', current: thisWeek.avgRating, previous: lastWeek.avgRating, decimals: 1 },
    { label: 'Positive %', current: thisWeek.positiveRate, previous: lastWeek.positiveRate, suffix: '%' },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border bg-card p-3 text-center">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
            {item.label}
          </p>
          <p className="text-xl font-bold text-foreground">
            {item.current.toFixed(item.decimals || 0)}{item.suffix || ''}
          </p>
          <div className="mt-1.5">
            <DeltaIndicator
              current={item.current}
              previous={item.previous}
              suffix={item.suffix}
              decimals={item.decimals}
            />
            <span className="text-[9px] text-muted-foreground ml-1">vs last week</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Default export for simpler dynamic import
export default ChartsRow
