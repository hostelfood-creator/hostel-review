import { createClient } from '@/lib/supabase/server'

export interface AuditLogEntry {
  actorId: string
  actorEmail?: string
  actorRole: string
  action: string
  targetType: string
  targetId?: string
  details?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Write an audit log entry for admin actions.
 * Fire-and-forget — never throws to avoid breaking the primary operation.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('audit_logs').insert({
      actor_id: entry.actorId,
      actor_email: entry.actorEmail || null,
      actor_role: entry.actorRole,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId || null,
      details: entry.details || {},
      ip_address: entry.ipAddress || null,
    })
  } catch (err) {
    // Silently fail — audit logging must never break the primary operation
    console.error('Audit log write failed:', err)
  }
}

/** Shorthand: log an admin action with auto-extracted profile info */
export async function logAdminAction(
  userId: string,
  role: string,
  action: string,
  targetType: string,
  targetId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string
): Promise<void> {
  return logAuditEvent({
    actorId: userId,
    actorRole: role,
    action,
    targetType,
    targetId,
    details,
    ipAddress,
  })
}
