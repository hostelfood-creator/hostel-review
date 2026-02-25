'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQrcode, faDownload, faPrint, faUtensils, faCopy, faCheck, faClock, faPencil } from '@fortawesome/free-solid-svg-icons'
import { toast } from 'sonner'

/**
 * Generate QR code SVG using a simple client-side QR generator.
 * We use the public Google Chart API to avoid adding a dependency.
 * For production, consider a library like 'qrcode' for offline generation.
 */
function getQRCodeUrl(text: string, size = 400): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=svg&margin=10`
}

interface AttendanceCounts {
  breakfast: number
  lunch: number
  snacks: number
  dinner: number
  total: number
  byBlock: Record<string, Record<string, number>>
}

interface MealTiming {
  start: string
  end: string
  label: string
}

const DEFAULT_TIMINGS: Record<string, MealTiming> = {
  breakfast: { start: '07:00', end: '10:00', label: 'Breakfast' },
  lunch:     { start: '12:00', end: '15:00', label: 'Lunch' },
  snacks:    { start: '16:00', end: '18:00', label: 'Snacks' },
  dinner:    { start: '19:00', end: '22:00', label: 'Dinner' },
}

export default function AdminAttendancePage() {
  const [checkinUrl, setCheckinUrl] = useState('')
  const [attendance, setAttendance] = useState<AttendanceCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [userRole, setUserRole] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  // ── Meal Timing Settings ──────────────────────────────────
  const [timings, setTimings] = useState<Record<string, MealTiming>>(DEFAULT_TIMINGS)
  const [editingTimings, setEditingTimings] = useState(false)
  const [timingDraft, setTimingDraft] = useState<Record<string, MealTiming>>(DEFAULT_TIMINGS)
  const [savingTimings, setSavingTimings] = useState(false)

  useEffect(() => {
    // Build the check-in URL based on current origin
    const url = `${window.location.origin}/student/checkin`
    setCheckinUrl(url)

    // Fetch attendance data
    const fetchData = async () => {
      try {
        const res = await fetch('/api/admin/checkin')
        const data = await res.json()
        setAttendance(data.counts || null)
        setUserRole(data.userRole || '')
      } catch {
        console.error('Failed to load attendance')
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    // Fetch meal timings
    const fetchTimings = async () => {
      try {
        const res = await fetch('/api/admin/meal-timings')
        const data = await res.json()
        if (data.timings) {
          setTimings(data.timings)
          setTimingDraft(data.timings)
        }
      } catch {
        console.error('Failed to load meal timings')
      }
    }
    fetchTimings()

    // Auto-refresh every 30 seconds
    const timer = setInterval(fetchData, 30000)
    return () => clearInterval(timer)
  }, [])

  const saveTimings = async () => {
    setSavingTimings(true)
    try {
      const res = await fetch('/api/admin/meal-timings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timings: timingDraft }),
      })
      const data = await res.json()
      if (res.ok) {
        setTimings(timingDraft)
        setEditingTimings(false)
        toast.success('Meal timings updated! QR check-in will now follow the new schedule.')
      } else {
        toast.error(data.error || 'Failed to save timings')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSavingTimings(false)
    }
  }

  /** Convert "07:00" to "7:00 AM" */
  const formatTime = (hhmm: string): string => {
    const [h, m] = hhmm.split(':').map(Number)
    const suffix = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrl)
      setCopied(true)
      toast.success('Link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = getQRCodeUrl(checkinUrl, 1000)
    link.download = 'meal-checkin-qr.svg'
    link.click()
    toast.success('QR code downloaded!')
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Please allow popups to print')
      return
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Meal Check-in QR Code</title>
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }
          h1 { font-size: 28px; margin-bottom: 8px; }
          p { color: #666; font-size: 16px; margin-bottom: 32px; }
          img { width: 400px; height: 400px; }
          .footer { margin-top: 32px; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Hostel Meal Check-in</h1>
        <p>Scan this QR code to mark your meal attendance</p>
        <img src="${getQRCodeUrl(checkinUrl, 400)}" alt="QR Code" />
        <div class="footer">
          <p>${checkinUrl}</p>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <FontAwesomeIcon icon={faQrcode} className="w-5 h-5 text-primary" />
          Meal Attendance
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          QR code-based meal check-in system — print and display in the mess hall
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Card */}
        <Card className="rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Check-in QR Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {checkinUrl ? (
              <>
                <div
                  ref={printRef}
                  className="w-full max-w-[280px] aspect-square rounded-2xl border-2 border-dashed border-primary/20 p-4 bg-white flex items-center justify-center mb-4"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getQRCodeUrl(checkinUrl, 400)}
                    alt="Meal Check-in QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>

                <p className="text-xs text-muted-foreground text-center mb-4 max-w-[280px]">
                  Students scan this QR code when arriving for meals. The system auto-detects the current meal based on time.
                </p>

                {/* URL display */}
                <div className="w-full max-w-[320px] flex items-center gap-2 p-2 rounded-lg bg-muted/50 border mb-4">
                  <code className="flex-1 text-xs text-muted-foreground truncate">
                    {checkinUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCopy}
                  >
                    <FontAwesomeIcon
                      icon={copied ? faCheck : faCopy}
                      className={`w-3.5 h-3.5 ${copied ? 'text-green-500' : ''}`}
                    />
                  </Button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 w-full max-w-[320px]">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleDownload}
                  >
                    <FontAwesomeIcon icon={faDownload} className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    className="flex-1 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                    onClick={handlePrint}
                  >
                    <FontAwesomeIcon icon={faPrint} className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                </div>
              </>
            ) : (
              <Skeleton className="w-64 h-64 rounded-xl" />
            )}
          </CardContent>
        </Card>

        {/* Today's Attendance Stats */}
        <div className="space-y-4">
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Today&apos;s Count</CardTitle>
                <Badge variant="secondary" className="text-[10px]">Live</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading || !attendance ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {['breakfast', 'lunch', 'snacks', 'dinner'].map((key) => {
                    const t = timings[key] || DEFAULT_TIMINGS[key]
                    return (
                    <div
                      key={key}
                      className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FontAwesomeIcon icon={faUtensils} className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{t.label}</p>
                          <p className="text-[10px] text-muted-foreground">{formatTime(t.start)} – {formatTime(t.end)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-foreground">
                          {attendance[key as keyof AttendanceCounts] as number}
                        </p>
                        <p className="text-[10px] text-muted-foreground">students</p>
                      </div>
                    </div>
                    )
                  })}

                  {/* Total */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10 mt-3">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faUtensils} className="w-4 h-4 text-primary" />
                      <span className="text-sm font-bold text-foreground">Total Check-ins</span>
                    </div>
                    <span className="text-2xl font-bold text-primary">{attendance.total}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-block breakdown for super admins */}
          {userRole === 'super_admin' && attendance && Object.keys(attendance.byBlock).length > 0 && (
            <Card className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">By Hostel Block</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Block</th>
                        <th className="text-center px-2 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">BF</th>
                        <th className="text-center px-2 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">LN</th>
                        <th className="text-center px-2 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">SN</th>
                        <th className="text-center px-2 py-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">DN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Object.entries(attendance.byBlock).map(([block, counts]) => (
                        <tr key={block} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium text-foreground text-xs">{block}</td>
                          <td className="px-2 py-2.5 text-center text-sm font-semibold">{(counts as Record<string, number>).breakfast || 0}</td>
                          <td className="px-2 py-2.5 text-center text-sm font-semibold">{(counts as Record<string, number>).lunch || 0}</td>
                          <td className="px-2 py-2.5 text-center text-sm font-semibold">{(counts as Record<string, number>).snacks || 0}</td>
                          <td className="px-2 py-2.5 text-center text-sm font-semibold">{(counts as Record<string, number>).dinner || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Meal Timing Settings */}
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faClock} className="w-3.5 h-3.5 text-primary" />
                  Check-in Timings
                </CardTitle>
                {!editingTimings && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setTimingDraft({ ...timings }); setEditingTimings(true) }}
                    className="text-muted-foreground hover:text-primary h-7 w-7"
                  >
                    <FontAwesomeIcon icon={faPencil} className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {editingTimings ? 'Set when students can check in for each meal.' : 'QR check-in only works during these windows.'}
              </p>
            </CardHeader>
            <CardContent>
              {editingTimings ? (
                <div className="space-y-4">
                  {['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => {
                    const draft = timingDraft[meal] || DEFAULT_TIMINGS[meal]
                    return (
                      <div key={meal} className="p-3 rounded-xl bg-muted/50 border space-y-2">
                        <p className="text-xs font-semibold text-foreground">{draft.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Start Time</Label>
                            <Input
                              type="time"
                              value={draft.start}
                              onChange={(e) => setTimingDraft(prev => ({
                                ...prev,
                                [meal]: { ...prev[meal], start: e.target.value }
                              }))}
                              className="mt-0.5 h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">End Time</Label>
                            <Input
                              type="time"
                              value={draft.end}
                              onChange={(e) => setTimingDraft(prev => ({
                                ...prev,
                                [meal]: { ...prev[meal], end: e.target.value }
                              }))}
                              className="mt-0.5 h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex gap-2">
                    <Button
                      onClick={saveTimings}
                      disabled={savingTimings}
                      className="flex-1 bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                    >
                      <FontAwesomeIcon icon={faCheck} className="w-3.5 h-3.5 mr-1.5" />
                      {savingTimings ? 'Saving...' : 'Save Timings'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditingTimings(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {['breakfast', 'lunch', 'snacks', 'dinner'].map((meal) => {
                    const t = timings[meal] || DEFAULT_TIMINGS[meal]
                    return (
                      <div key={meal} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium text-foreground">{t.label}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatTime(t.start)} – {formatTime(t.end)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { step: '1', text: 'Print the QR code and display it at the mess hall entrance' },
                  { step: '2', text: 'Students scan the code with their phone camera' },
                  { step: '3', text: 'If not logged in, they\'re prompted to sign in first' },
                  { step: '4', text: 'The system auto-detects the current meal and records attendance' },
                  { step: '5', text: 'Real-time counts appear here on your dashboard' },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-primary">{item.step}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
