import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// ── Users ─────────────────────────────────────────────────

export async function getUserByRegisterId(registerId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('register_id', registerId)
    .single()

  if (error || !data) return null
  return { ...data, _id: data.id, registerId: data.register_id, hostelBlock: data.hostel_block, passwordHash: '' }
}

export async function getUserById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return { ...data, _id: data.id, registerId: data.register_id, hostelBlock: data.hostel_block }
}



export async function getStudentHostelBlocks() {
  const supabase = await createClient()

  // Pull from the canonical hostel_blocks table (managed by super admins)
  // so the filter always shows all configured blocks even if no students are assigned yet
  const { data, error } = await supabase
    .from('hostel_blocks')
    .select('name')
    .order('name', { ascending: true })

  if (!error && data && data.length > 0) {
    return data.map((b) => b.name) as string[]
  }

  // Fallback: derive from student profiles if hostel_blocks table is empty / doesn't exist
  const { data: profileData } = await supabase
    .from('profiles')
    .select('hostel_block')
    .eq('role', 'student')
    .not('hostel_block', 'is', null)

  const blocks = new Set((profileData || []).map((p) => p.hostel_block))
  return Array.from(blocks) as string[]
}

// ── Reviews ───────────────────────────────────────────────

export async function getReviews(filters: {
  userId?: string;
  date?: string;
  mealType?: string;
  limit?: number;
  offset?: number;
  hostelBlock?: string;
}): Promise<{ data: any[]; total: number }> {
  const supabase = await createClient()

  // If filtering by hostel block, first get the user IDs for that block
  let userIdsForBlock: string[] | null = null
  if (filters.hostelBlock) {
    const { data: blockUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('hostel_block', filters.hostelBlock)
      .eq('role', 'student')
    userIdsForBlock = (blockUsers || []).map((u: { id: string }) => u.id)
    if (userIdsForBlock.length === 0) return { data: [], total: 0 } // No students in this block
  }

  let query = supabase
    .from('reviews')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.date) query = query.eq('date', filters.date)
  if (filters.mealType) query = query.eq('meal_type', filters.mealType)
  if (userIdsForBlock) query = query.in('user_id', userIdsForBlock)

  // Pagination
  const limit = filters.limit || 50
  const offset = filters.offset || 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error || !data) return { data: [], total: 0 }
  const total = count ?? data.length

  // Resolve profile names/blocks via SERVICE ROLE client (bypasses RLS)
  // SECURITY: This is intentional — RLS correctly blocks students from reading other users'
  // profiles, but admins need to see reviewer names. Authorization is enforced by the calling
  // API routes (/api/reviews, /api/analytics) which check roles before calling this function.
  // Only non-sensitive display fields are fetched (name, hostel_block, register_id, department, year).
  const serviceDb = createServiceClient()
  const uniqueUserIds = [...new Set(data.map((r: any) => r.user_id))]
  const profileMap = new Map<string, { name: string; hostel_block: string | null; register_id: string | null; department: string | null; year: string | null }>()
  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await serviceDb
      .from('profiles')
      .select('id, name, hostel_block, register_id, department, year')
      .in('id', uniqueUserIds)
      ; (profiles || []).forEach((p: any) => profileMap.set(p.id, { name: p.name, hostel_block: p.hostel_block, register_id: p.register_id, department: p.department, year: p.year }))
  }

  const mapped = data.map((r: any) => {
    const profile = profileMap.get(r.user_id)
    return {
      ...r,
      _id: r.id,
      userId: r.user_id,
      mealType: r.meal_type,
      reviewText: r.review_text,
      userName: r.anonymous ? 'Anonymous' : (profile?.name || 'Unknown'),
      userRegisterId: r.anonymous ? null : (profile?.register_id || null),
      hostelBlock: profile?.hostel_block || null,
      department: profile?.department || null,
      year: profile?.year || null,
      createdAt: r.created_at || null,
      adminReply: r.admin_reply || null,
      adminReplyBy: r.admin_reply_by || null,
      adminRepliedAt: r.admin_replied_at || null,
      _creationTime: new Date(r.created_at).getTime()
    }
  })

  return { data: mapped, total }
}

export async function getExistingReview(userId: string, date: string, mealType: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('meal_type', mealType)
    .single()

  if (error || !data) return null
  return { ...data, _id: data.id, userId: data.user_id, mealType: data.meal_type, reviewText: data.review_text }
}

export async function createReview(data: {
  userId: string;
  date: string;
  mealType: string;
  rating: number;
  reviewText?: string;
  sentiment?: string;
  anonymous: boolean;
}) {
  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('reviews')
    .insert({
      user_id: data.userId,
      date: data.date,
      meal_type: data.mealType,
      rating: data.rating,
      review_text: data.reviewText,
      sentiment: data.sentiment,
      anonymous: data.anonymous,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return inserted.id
}

export async function getReviewsForAnalytics(
  startDate: string,
  mealType?: string,
  hostelBlock?: string
) {
  const supabase = await createClient()

  // If filtering by hostel block, first resolve to user IDs (correct Supabase join filtering)
  let userIdsForBlock: string[] | null = null
  if (hostelBlock) {
    const { data: blockUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('hostel_block', hostelBlock)
      .eq('role', 'student')
    userIdsForBlock = (blockUsers || []).map((u: { id: string }) => u.id)
    if (userIdsForBlock.length === 0) return []
  }

  let query = supabase
    .from('reviews')
    .select('*')
    .gte('date', startDate)
    .order('date', { ascending: true })

  if (mealType) query = query.eq('meal_type', mealType)
  if (userIdsForBlock) query = query.in('user_id', userIdsForBlock)

  const { data, error } = await query
  if (error || !data) return []

  // Resolve profiles via SERVICE ROLE client (bypasses RLS)
  // SECURITY: Intentional — caller (/api/analytics) enforces admin-only access. Service role
  // needed because RLS blocks cross-user profile reads. Only display fields fetched.
  const serviceDb = createServiceClient()
  const uniqueUserIds = [...new Set(data.map((r: any) => r.user_id))]
  const profileMap = new Map<string, { name: string; hostel_block: string | null; register_id: string | null }>()
  if (uniqueUserIds.length > 0) {
    const { data: profiles } = await serviceDb
      .from('profiles')
      .select('id, name, hostel_block, register_id')
      .in('id', uniqueUserIds)
      ; (profiles || []).forEach((p: any) => profileMap.set(p.id, { name: p.name, hostel_block: p.hostel_block, register_id: p.register_id }))
  }

  return data.map((r: any) => {
    const profile = profileMap.get(r.user_id)
    return {
      ...r,
      _id: r.id,
      userId: r.user_id,
      mealType: r.meal_type,
      userName: r.anonymous ? 'Anonymous' : (profile?.name || 'Unknown'),
      userRegisterId: r.anonymous ? null : (profile?.register_id || null),
      hostelBlock: profile?.hostel_block || null,
    }
  })
}

// ── Menus ─────────────────────────────────────────────────

export async function getMenusByDate(date: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('date', date)

  if (error || !data) return []
  return data.map((m) => ({ ...m, _id: m.id, mealType: m.meal_type }))
}

export async function upsertMenu(data: {
  date: string;
  mealType: string;
  items: string;
  timing: string;
}) {
  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('menus')
    .upsert(
      { date: data.date, meal_type: data.mealType, items: data.items, timing: data.timing },
      { onConflict: 'date,meal_type' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return inserted.id
}

// ── Meal Check-ins (QR Attendance) ────────────────────────

export async function createMealCheckin(data: {
  userId: string;
  mealType: string;
  date: string;
  hostelBlock: string | null;
}) {
  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('meal_checkins')
    .insert({
      user_id: data.userId,
      meal_type: data.mealType,
      date: data.date,
      hostel_block: data.hostelBlock,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation → already checked in
    if (error.code === '23505') return { alreadyCheckedIn: true, id: null }
    throw new Error(error.message)
  }
  return { alreadyCheckedIn: false, id: inserted.id }
}

export async function getUserCheckins(userId: string, date: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('meal_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)

  if (error || !data) return []
  return data.map((c) => ({
    id: c.id,
    mealType: c.meal_type,
    date: c.date,
    checkedInAt: c.checked_in_at,
    hostelBlock: c.hostel_block,
  }))
}

export async function getMealAttendanceCounts(date: string, hostelBlock?: string) {
  const serviceDb = createServiceClient()

  let query = serviceDb
    .from('meal_checkins')
    .select('meal_type, hostel_block')
    .eq('date', date)

  if (hostelBlock) {
    query = query.eq('hostel_block', hostelBlock)
  }

  const { data, error } = await query
  if (error || !data) return { breakfast: 0, lunch: 0, snacks: 0, dinner: 0, total: 0, byBlock: {} as Record<string, Record<string, number>> }

  const counts: Record<string, number> = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 }
  const byBlock: Record<string, Record<string, number>> = {}

  for (const row of data) {
    const meal = row.meal_type as string
    const block = row.hostel_block as string | null
    if (counts[meal] !== undefined) counts[meal]++

    if (block) {
      if (!byBlock[block]) byBlock[block] = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 }
      if (byBlock[block][meal] !== undefined) byBlock[block][meal]++
    }
  }

  return {
    ...counts,
    total: data.length,
    byBlock,
  }
}

// ── Detailed Attendance List (who ate / who missed) ───────

export interface AttendanceRecord {
  userId: string
  name: string
  registerId: string | null
  hostelBlock: string | null
  department: string | null
  year: string | null
  meals: Record<string, { checkedIn: boolean; checkedInAt: string | null }>
}

/**
 * Get detailed attendance list for a given date.
 * Returns each student with their check-in status for every meal.
 */
export async function getAttendanceList(
  date: string,
  hostelBlock?: string,
  mealType?: string
): Promise<{ records: AttendanceRecord[]; summary: { total: number; ate: Record<string, number>; missed: Record<string, number> } }> {
  const serviceDb = createServiceClient()

  // 1. Get all students (optionally filtered by block)
  let studentQuery = serviceDb
    .from('profiles')
    .select('id, name, register_id, hostel_block, department, year')
    .eq('role', 'student')
    .order('name', { ascending: true })

  if (hostelBlock) {
    studentQuery = studentQuery.eq('hostel_block', hostelBlock)
  }

  const { data: students, error: studentsErr } = await studentQuery
  if (studentsErr || !students) return { records: [], summary: { total: 0, ate: {}, missed: {} } }

  // 2. Get all check-ins for this date
  let checkinQuery = serviceDb
    .from('meal_checkins')
    .select('user_id, meal_type, checked_in_at')
    .eq('date', date)

  if (hostelBlock) {
    checkinQuery = checkinQuery.eq('hostel_block', hostelBlock)
  }
  if (mealType) {
    checkinQuery = checkinQuery.eq('meal_type', mealType)
  }

  const { data: checkins, error: checkinsErr } = await checkinQuery
  if (checkinsErr) return { records: [], summary: { total: 0, ate: {}, missed: {} } }

  // 3. Build a map: userId -> { mealType -> checkedInAt }
  const checkinMap = new Map<string, Map<string, string>>()
  for (const c of (checkins || [])) {
    if (!checkinMap.has(c.user_id)) checkinMap.set(c.user_id, new Map())
    checkinMap.get(c.user_id)!.set(c.meal_type, c.checked_in_at)
  }

  const meals = mealType ? [mealType] : ['breakfast', 'lunch', 'snacks', 'dinner']
  const ate: Record<string, number> = {}
  const missed: Record<string, number> = {}
  meals.forEach(m => { ate[m] = 0; missed[m] = 0 })

  // 4. Build records
  const records: AttendanceRecord[] = students.map((s: any) => {
    const userCheckins = checkinMap.get(s.id)
    const mealStatus: Record<string, { checkedIn: boolean; checkedInAt: string | null }> = {}

    meals.forEach(m => {
      const checkedInAt = userCheckins?.get(m) || null
      mealStatus[m] = { checkedIn: !!checkedInAt, checkedInAt }
      if (checkedInAt) ate[m]++; else missed[m]++
    })

    return {
      userId: s.id,
      name: s.name,
      registerId: s.register_id,
      hostelBlock: s.hostel_block,
      department: s.department,
      year: s.year,
      meals: mealStatus,
    }
  })

  return {
    records,
    summary: {
      total: students.length,
      ate,
      missed,
    },
  }
}

/**
 * Get attendance history for multiple dates (day-by-day tracking).
 */
export async function getAttendanceHistory(
  startDate: string,
  endDate: string,
  hostelBlock?: string
): Promise<{ date: string; counts: Record<string, number>; total: number }[]> {
  const serviceDb = createServiceClient()

  let query = serviceDb
    .from('meal_checkins')
    .select('date, meal_type')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (hostelBlock) {
    query = query.eq('hostel_block', hostelBlock)
  }

  const { data, error } = await query
  if (error || !data) return []

  const dayMap = new Map<string, Record<string, number>>()
  for (const row of data) {
    const d = row.date as string
    const m = row.meal_type as string
    if (!dayMap.has(d)) dayMap.set(d, { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 })
    const counts = dayMap.get(d)!
    if (counts[m] !== undefined) counts[m]++
  }

  return Array.from(dayMap.entries()).map(([date, counts]) => ({
    date,
    counts,
    total: Object.values(counts).reduce((s, c) => s + c, 0),
  }))
}
