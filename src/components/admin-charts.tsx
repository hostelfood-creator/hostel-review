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

// Default export for simpler dynamic import
export default ChartsRow
