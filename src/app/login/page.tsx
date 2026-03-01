'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import Image from 'next/image'
import { BlurFade } from '@/components/ui/blur-fade'
import { ThemeToggle } from '@/lib/theme'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { OtpInput } from '@/components/ui/otp-input'
import ParticlesBackground from '@/components/particles-background'
import { motion } from 'framer-motion'
import { UserGuide } from '@/components/user-guide'
import { Turnstile, type TurnstileRef } from '@/components/turnstile'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || null
  const [isRegister, setIsRegister] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [otpStep, setOtpStep] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [nameLocked, setNameLocked] = useState(false)
  const [fieldsLocked, setFieldsLocked] = useState(false)
  const [emailLocked, setEmailLocked] = useState(false)
  const [lookingUpName, setLookingUpName] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileFailed, setTurnstileFailed] = useState(false)
  const turnstileRef = useRef<TurnstileRef>(null)
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [form, setForm] = useState({
    registerId: '',
    password: '',
    name: '',
    email: '',
    forgotEmail: '',
    hostelBlock: '',
    department: '',
    year: '',
    otp: '',
    confirmPassword: '',
  })

  // Debounced lookup: auto-fetch student details when register ID changes in register mode
  const lookupStudent = useCallback(async (regId: string) => {
    const trimmed = regId.trim()
    // Server requires 5+ chars — don't waste requests on shorter IDs
    if (trimmed.length < 5) {
      // Only clear auto-filled data — preserve manual input
      if (nameLocked) {
        setNameLocked(false)
        setEmailLocked(false)
        setFieldsLocked(false)
        setForm(prev => ({ ...prev, name: '', email: '' }))
      }
      return
    }
    setLookingUpName(true)
    try {
      const res = await fetch(`/api/auth/lookup?registerId=${encodeURIComponent(trimmed)}`)
      // Handle rate limiting gracefully — unlock but preserve manual input
      if (res.status === 429) {
        if (nameLocked) {
          setNameLocked(false)
          setEmailLocked(false)
          setFieldsLocked(false)
          setForm(prev => ({ ...prev, name: '', email: '' }))
        }
        toast.error('Too many lookups — please wait a moment and try again.')
        return
      }
      if (!res.ok) {
        if (nameLocked) {
          setNameLocked(false)
          setEmailLocked(false)
          setFieldsLocked(false)
          setForm(prev => ({ ...prev, name: '', email: '' }))
        }
        console.error('Lookup failed:', res.status)
        return
      }
      const data = await res.json()
      if (data.found) {
        const autoEmail = `${trimmed.toLowerCase()}@kanchiuniv.ac.in`
        setForm(prev => ({
          ...prev,
          name: data.name,
          email: autoEmail,
          ...(data.hostelBlock ? { hostelBlock: data.hostelBlock } : {}),
          ...(data.department ? { department: data.department } : {}),
          ...(data.year ? { year: data.year } : {}),
        }))
        setNameLocked(true)
        setEmailLocked(true)
        setFieldsLocked(true)
        // Clear errors for auto-filled fields
        setFieldErrors(prev => {
          const n = { ...prev }
          delete n.name
          delete n.email
          if (data.hostelBlock) delete n.hostelBlock
          if (data.year) delete n.year
          return n
        })
      } else {
        // Not found — only clear if previously auto-filled, preserve manual input
        if (nameLocked) {
          setForm(prev => ({ ...prev, name: '', email: '' }))
        }
        setNameLocked(false)
        setEmailLocked(false)
        setFieldsLocked(false)
      }
    } catch {
      if (nameLocked) {
        setNameLocked(false)
        setEmailLocked(false)
        setFieldsLocked(false)
        setForm(prev => ({ ...prev, name: '', email: '' }))
      }
    } finally {
      setLookingUpName(false)
    }
  }, [nameLocked])

  // Trigger lookup when register ID changes during registration
  useEffect(() => {
    if (!isRegister) return
    if (lookupTimer.current) clearTimeout(lookupTimer.current)
    lookupTimer.current = setTimeout(() => {
      lookupStudent(form.registerId)
    }, 500) // 500ms debounce
    return () => { if (lookupTimer.current) clearTimeout(lookupTimer.current) }
  }, [form.registerId, isRegister, lookupStudent])

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!form.registerId.trim()) errors.registerId = 'Register ID is required'
    if (!form.password) errors.password = 'Password is required'
    if (form.password && form.password.length < 8) errors.password = 'Password must be at least 8 characters'

    if (isRegister) {
      if (!form.name.trim()) errors.name = 'Full name is required'
      if (form.name.trim().length > 30) errors.name = 'Name must be 30 characters or less'
      if (!form.email.trim()) errors.email = 'Email is required'
      if (form.email && !form.email.toLowerCase().endsWith('@kanchiuniv.ac.in')) {
        errors.email = 'Only @kanchiuniv.ac.in email addresses are accepted'
      }
      if (!form.hostelBlock) errors.hostelBlock = 'Hostel block is required'
      if (!form.year) errors.year = 'Year is required'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailVal = form.forgotEmail.trim().toLowerCase()
    if (!emailVal) {
      setFieldErrors({ forgotEmail: 'Email address is required' })
      return
    }
    if (!emailVal.endsWith('@kanchiuniv.ac.in')) {
      setFieldErrors({ forgotEmail: 'Enter your @kanchiuniv.ac.in college email' })
      return
    }
    if (!turnstileToken && !turnstileFailed) {
      toast.error('Bot verification loading — please wait a moment and try again.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, turnstileToken })
      })
      const data = await res.json()
      if (res.status === 404) {
        setError('This email is not registered. Please register first.')
        toast.error('Email not found — please create an account first.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP')
      toast.success('OTP sent to your email.')
      setOtpStep(true)
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
      // Reset Turnstile widget — tokens are single-use
      setTurnstileToken(null)
      turnstileRef.current?.reset()
    }
  }

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.otp || form.otp.length !== 6) {
      setFieldErrors({ otp: 'Valid 6-digit OTP is required' })
      return
    }
    if (!form.password || form.password.length < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters' })
      return
    }
    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' })
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.forgotEmail.trim().toLowerCase(),
          otp: form.otp,
          newPassword: form.password
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')
      toast.success('Password reset successfully! Please log in.')
      setIsForgotPassword(false)
      setOtpStep(false)
      setForm(prev => ({ ...prev, password: '', confirmPassword: '', otp: '', forgotEmail: '' }))
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validate()) return

    if (!turnstileToken && !turnstileFailed) {
      toast.error('Bot verification loading — please wait a moment and try again.')
      return
    }

    setLoading(true)

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const body = isRegister
        ? { ...form, turnstileToken }
        : { registerId: form.registerId, password: form.password, rememberMe, turnstileToken }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        if (isRegister && res.status === 409) {
          toast.error('Account already exists! Switching to Sign In...')
          setIsRegister(false)
          return
        }
        setError(data.error || 'Something went wrong')
        toast.error(data.error || 'Authentication failed')
        return
      }

      toast.success('Signed in successfully!')

      // If there's a redirect parameter (e.g., from QR code scanning), go there
      if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
        window.location.href = redirectTo
      } else if (data.user.role === 'student') {
        window.location.href = '/student'
      } else {
        window.location.href = '/admin'
      }
    } catch {
      setError('Network error. Please try again.')
      toast.error('Network error. Please check your connection.')
    } finally {
      setLoading(false)
      // Reset Turnstile widget — tokens are single-use
      setTurnstileToken(null)
      turnstileRef.current?.reset()
    }
  }

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Password strength calculation for registration
  const getPasswordStrength = (pw: string): { level: number; label: string; color: string } => {
    if (!pw) return { level: 0, label: '', color: '' }
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
    if (/\d/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++

    if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' }
    if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-orange-500' }
    if (score <= 3) return { level: 3, label: 'Medium', color: 'bg-yellow-500' }
    if (score <= 4) return { level: 4, label: 'Strong', color: 'bg-emerald-500' }
    return { level: 5, label: 'Very Strong', color: 'bg-emerald-600' }
  }

  const passwordStrength = getPasswordStrength(form.password)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 transition-colors relative overflow-hidden">
      {/* Parallax floating particles */}
      <ParticlesBackground />

      {/* Cloudflare Turnstile — bot protection with graceful degradation */}
      <Turnstile
        ref={turnstileRef}
        onVerify={(token) => {
          console.log('[Turnstile] Token set')
          setTurnstileToken(token)
          setTurnstileFailed(false)
        }}
        onExpire={() => setTurnstileToken(null)}
        onError={(code) => {
          console.error('[Turnstile] Error:', code)
          setTurnstileToken(null)
        }}
        onFatalError={() => {
          console.error('[Turnstile] All retries exhausted — enabling bypass')
          setTurnstileFailed(true)
        }}
      />

      {/* Theme Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md lg:max-w-lg relative z-10">
        {/* Logo / Header */}
        <BlurFade delay={0.1} inView>
          <div className="text-center mb-10">
            <Image
              src="/scsvmv-logo.png"
              alt="SCSVMV University"
              width={80}
              height={80}
              className="mx-auto mb-5 select-none pointer-events-none"
              draggable={false}
              priority
            />
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Hostel Food Review
            </h1>
            <p className="text-muted-foreground text-base mt-2">
              Food Quality Platform
            </p>
          </div>
        </BlurFade>

        {/* Form Card */}
        <BlurFade delay={0.25} inView>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">
                {isForgotPassword ? (otpStep ? 'Verify OTP' : 'Reset Password') : isRegister ? 'Create Account' : 'Sign In'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription className="text-sm">{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={loading} className="space-y-4">
                  {/* In forgot-password mode: show email field instead of register ID */}
                  {isForgotPassword && !otpStep ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="forgotEmail" className="text-sm font-medium text-foreground">
                        College Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="forgotEmail"
                        type="email"
                        required
                        value={form.forgotEmail}
                        onChange={(e) => updateForm('forgotEmail', e.target.value)}
                        placeholder="Enter your registered email"
                        className={`h-11 text-base ${fieldErrors.forgotEmail ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      />
                      {fieldErrors.forgotEmail && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.forgotEmail}</p>
                      )}
                    </div>
                  ) : !isForgotPassword ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="registerId" className="text-sm font-medium text-foreground">
                        Register ID <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="registerId"
                        type="text"
                        required
                        value={form.registerId}
                        onChange={(e) => updateForm('registerId', e.target.value)}
                        placeholder="Enter your Register No."
                        className={`h-11 text-base ${fieldErrors.registerId ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      />
                      {fieldErrors.registerId && (
                        <p className="text-xs text-destructive mt-1">{fieldErrors.registerId}</p>
                      )}
                    </div>
                  ) : null}

                  {isForgotPassword ? (
                    otpStep ? (
                      <>
                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-foreground block text-center">
                            Verification Code <span className="text-destructive">*</span>
                          </Label>
                          <OtpInput
                            value={form.otp}
                            onChange={(val) => updateForm('otp', val)}
                            disabled={loading}
                            error={!!fieldErrors.otp}
                          />
                          {fieldErrors.otp && (
                            <p className="text-xs text-destructive mt-1 text-center">{fieldErrors.otp}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="password" className="text-sm font-medium text-foreground">
                            New Password <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="password"
                              type={showPassword ? 'text' : 'password'}
                              required
                              value={form.password}
                              onChange={(e) => updateForm('password', e.target.value)}
                              placeholder="Enter your new password"
                              className={`h-11 text-base pr-11 ${fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="w-4 h-4" />
                            </button>
                          </div>
                          {fieldErrors.password && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                            Confirm Password <span className="text-destructive">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showPassword ? 'text' : 'password'}
                              required
                              value={form.confirmPassword}
                              onChange={(e) => updateForm('confirmPassword', e.target.value)}
                              placeholder="Confirm new password"
                              className={`h-11 text-base pr-11 ${fieldErrors.confirmPassword ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            />
                          </div>
                          {fieldErrors.confirmPassword && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors.confirmPassword}</p>
                          )}
                        </div>
                      </>
                    ) : null
                  ) : isRegister ? (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-sm font-medium text-foreground">
                          Full Name <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="name"
                            type="text"
                            required
                            maxLength={30}
                            value={form.name}
                            onChange={(e) => { if (!nameLocked) updateForm('name', e.target.value) }}
                            readOnly={nameLocked}
                            placeholder={lookingUpName ? 'Looking up...' : form.registerId.trim().length < 5 ? 'Enter Register ID first' : 'Enter your Full Name'}
                            className={`h-11 text-base pr-10 ${nameLocked ? 'bg-muted cursor-not-allowed' : ''} ${fieldErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                          />
                          {lookingUpName && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                            </div>
                          )}
                          {nameLocked && !lookingUpName && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            </div>
                          )}
                        </div>
                        {nameLocked && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Name auto-filled from university records</p>
                        )}
                        {!nameLocked && !lookingUpName && form.registerId.trim().length >= 3 && !form.name && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Register ID not found in records — enter name manually</p>
                        )}
                        {fieldErrors.name && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-sm font-medium text-foreground">
                          Email <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          value={form.email}
                          onChange={(e) => { if (!emailLocked) updateForm('email', e.target.value) }}
                          readOnly={emailLocked}
                          placeholder="Enter your College Email"
                          className={`h-11 text-base ${emailLocked ? 'bg-muted cursor-not-allowed' : ''} ${fieldErrors.email ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                        {emailLocked && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Email auto-filled from Register ID</p>
                        )}
                        {fieldErrors.email && (
                          <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-foreground">
                            Hostel Block <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={form.hostelBlock}
                            onValueChange={(v) => { if (!fieldsLocked) updateForm('hostelBlock', v) }}
                            disabled={fieldsLocked}
                          >
                            <SelectTrigger className={`h-11 ${fieldsLocked ? 'bg-muted cursor-not-allowed' : ''} ${fieldErrors.hostelBlock ? 'border-destructive' : ''}`}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Annapoorani Hostel">Annapoorani Hostel</SelectItem>
                              <SelectItem value="Visalakshi Hostel">Visalakshi Hostel</SelectItem>
                              <SelectItem value="Sri Saraswathi Hostel">Sri Saraswathi Hostel</SelectItem>
                              <SelectItem value="Sri Kamakshi Hostel">Sri Kamakshi Hostel</SelectItem>
                              <SelectItem value="Sri Meenakshi Hostel">Sri Meenakshi Hostel</SelectItem>
                            </SelectContent>
                          </Select>
                          {fieldErrors.hostelBlock && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors.hostelBlock}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-foreground">
                            Year <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={form.year}
                            onValueChange={(v) => updateForm('year', v)}
                          >
                            <SelectTrigger className={`h-11 ${fieldErrors.year ? 'border-destructive' : ''}`}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1st">1st Year</SelectItem>
                              <SelectItem value="2nd">2nd Year</SelectItem>
                              <SelectItem value="3rd">3rd Year</SelectItem>
                              <SelectItem value="4th">4th Year</SelectItem>
                              <SelectItem value="5th">5th Year</SelectItem>
                            </SelectContent>
                          </Select>
                          {fieldErrors.year && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors.year}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="department" className="text-sm font-medium text-foreground">
                          Department
                        </Label>
                        <Input
                          id="department"
                          type="text"
                          value={form.department}
                          onChange={(e) => { if (!fieldsLocked) updateForm('department', e.target.value) }}
                          readOnly={fieldsLocked}
                          placeholder="Enter your Department"
                          className={`h-11 text-base ${fieldsLocked ? 'bg-muted cursor-not-allowed' : ''}`}
                        />
                      </div>
                      {nameLocked && (
                        <div className="space-y-1 -mt-1">
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">Details auto-filled from university records.</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400">If any information is incorrect, please contact the hostel admin after registration.</p>
                        </div>
                      )}
                    </>
                  ) : null}

                  {!isForgotPassword && (
                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-sm font-medium text-foreground">
                        Password <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={form.password}
                          onChange={(e) => updateForm('password', e.target.value)}
                          placeholder="Enter your password"
                          className={`h-11 text-base pr-11 ${fieldErrors.password ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Password Strength Indicator — only shown during registration */}
                      {isRegister && form.password.length > 0 && (
                        <div className="space-y-1 mt-1.5">
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                                  i <= passwordStrength.level ? passwordStrength.color : 'bg-muted'
                                }`}
                              />
                            ))}
                          </div>
                          <p className={`text-xs font-medium ${
                            passwordStrength.level <= 1 ? 'text-red-500' :
                            passwordStrength.level <= 2 ? 'text-orange-500' :
                            passwordStrength.level <= 3 ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-emerald-500'
                          }`}>
                            {passwordStrength.label}
                            {passwordStrength.level <= 2 && ' — use 8+ chars, uppercase, numbers & symbols'}
                          </p>
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-1">
                        {fieldErrors.password ? (
                          <p className="text-xs text-destructive">{fieldErrors.password}</p>
                        ) : <div />}
                        {!isRegister && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsForgotPassword(true)
                              setError('')
                              setFieldErrors({})
                            }}
                            className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Remember Me — login mode only */}
                  {!isForgotPassword && !isRegister && (
                    <div className="flex items-center gap-2 -mt-1">
                      <input
                        id="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 accent-primary cursor-pointer"
                      />
                      <Label
                        htmlFor="rememberMe"
                        className="text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      >
                        Remember me
                      </Label>
                    </div>
                  )}

                  <Button
                    type={isForgotPassword ? "button" : "submit"}
                    variant="default"
                    onClick={isForgotPassword ? (otpStep ? handleVerifyOTP : handleRequestOTP) : undefined}
                    disabled={loading}
                    className="w-full mt-2 h-11 text-base font-semibold bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 disabled:opacity-70"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {isForgotPassword ? 'Processing...' : isRegister ? 'Creating Account...' : 'Signing In...'}
                      </span>
                    ) : isForgotPassword ? (otpStep ? 'Reset Password' : 'Send Code') : isRegister ? 'Create Account' : 'Sign In'}
                  </Button>
                </fieldset>
              </form>

              <div className="mt-5 text-center">
                {isForgotPassword ? (
                  <Button
                    variant="link"
                    disabled={loading}
                    onClick={() => {
                      setIsForgotPassword(false)
                      setOtpStep(false)
                      setError('')
                      setFieldErrors({})
                    }}
                    className="text-muted-foreground hover:text-primary text-sm disabled:opacity-50"
                  >
                    Back to Sign In
                  </Button>
                ) : (
                  <Button
                    variant="link"
                    disabled={loading}
                    onClick={() => {
                      setIsRegister(!isRegister)
                      setNameLocked(false)
                      setFieldsLocked(false)
                      setEmailLocked(false)
                      setLookingUpName(false)
                      setError('')
                      setFieldErrors({})
                    }}
                    className="text-muted-foreground hover:text-primary text-sm disabled:opacity-50"
                  >
                    {isRegister
                      ? 'Already have an account? Sign In'
                      : "Don't have an account? Register"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </BlurFade>

        {/* Social proof counter & User Guide */}
        <BlurFade delay={0.4} inView>
          <div className="mt-6 space-y-3">
            <p className="text-center text-muted-foreground text-sm select-none">
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="inline-block"
              >
                🎓 <span className="font-semibold text-foreground">1,100+</span> students already registered
              </motion.span>
            </p>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.5 }}
              className="flex justify-center"
            >
              <UserGuide />
            </motion.div>
          </div>
        </BlurFade>
      </div>
    </div>
  )
}
