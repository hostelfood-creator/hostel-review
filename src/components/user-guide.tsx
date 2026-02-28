'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBookOpen,
  faUserPlus,
  faRightToBracket,
  faStar,
  faQrcode,
  faClockRotateLeft,
  faTriangleExclamation,
  faUserGear,
  faChevronRight,
  faChevronLeft,
  faArrowRight,
  faShieldHalved,
  faUtensils,
  faCircleCheck,
  faLanguage,
  faMoon,
} from '@fortawesome/free-solid-svg-icons'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface GuideStep {
  id: number
  title: string
  subtitle: string
  icon: typeof faBookOpen
  iconColor: string
  content: React.ReactNode
}

const guideSteps: GuideStep[] = [
  {
    id: 1,
    title: 'Welcome',
    subtitle: 'Getting Started',
    icon: faUtensils,
    iconColor: 'text-emerald-500',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Hostel Food Review</strong> is your platform to rate daily hostel meals, 
          check in for meals via QR code, file complaints, and help management 
          improve food quality.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: faStar, label: 'Rate Meals', color: 'text-amber-500' },
            { icon: faQrcode, label: 'QR Check-in', color: 'text-blue-500' },
            { icon: faTriangleExclamation, label: 'Complaints', color: 'text-orange-500' },
            { icon: faClockRotateLeft, label: 'Review History', color: 'text-purple-500' },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50 border border-border/50"
            >
              <FontAwesomeIcon icon={f.icon} className={`w-4 h-4 ${f.color}`} />
              <span className="text-xs font-medium text-foreground">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 2,
    title: 'Create Account',
    subtitle: 'Step 1 — Registration',
    icon: faUserPlus,
    iconColor: 'text-blue-500',
    content: (
      <div className="space-y-3">
        <ol className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">1</Badge>
            <span>Click <strong className="text-foreground">&quot;Don&apos;t have an account? Register&quot;</strong> on the Sign In page.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">2</Badge>
            <span>Enter your <strong className="text-foreground">Register ID</strong> — your name & email will auto-fill from university records.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">3</Badge>
            <span>Select your <strong className="text-foreground">Hostel Block</strong> and <strong className="text-foreground">Year</strong>, then set a strong password.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">4</Badge>
            <span>Click <strong className="text-foreground">&quot;Create Account&quot;</strong> — you&apos;re in!</span>
          </li>
        </ol>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <FontAwesomeIcon icon={faCircleCheck} className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Your details are auto-filled from university records for accuracy.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    title: 'Sign In',
    subtitle: 'Step 2 — Login',
    icon: faRightToBracket,
    iconColor: 'text-indigo-500',
    content: (
      <div className="space-y-3">
        <ol className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">1</Badge>
            <span>Enter your <strong className="text-foreground">Register ID</strong> and <strong className="text-foreground">Password</strong>.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">2</Badge>
            <span>Check <strong className="text-foreground">&quot;Remember me&quot;</strong> to stay signed in across sessions.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">3</Badge>
            <span>Click <strong className="text-foreground">&quot;Sign In&quot;</strong> to access your dashboard.</span>
          </li>
        </ol>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <FontAwesomeIcon icon={faShieldHalved} className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Forgot your password? Click <strong>&quot;Forgot Password?&quot;</strong> to reset via email OTP.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: 'Rate Meals',
    subtitle: 'Step 3 — Review Food',
    icon: faStar,
    iconColor: 'text-amber-500',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          After signing in, your <strong className="text-foreground">Student Dashboard</strong> shows today&apos;s menu 
          with all four meals — Breakfast, Lunch, Snacks, and Dinner.
        </p>
        <ol className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">1</Badge>
            <span>Tap the <strong className="text-foreground">star slider</strong> (1–5) to set your rating.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">2</Badge>
            <span>Select <strong className="text-foreground">feedback tags</strong> (e.g., &quot;Fresh&quot;, &quot;Tasty&quot;, &quot;Cold&quot;) that match your experience.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">3</Badge>
            <span>Optionally add a <strong className="text-foreground">written review</strong> for detailed feedback.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">4</Badge>
            <span>Click <strong className="text-foreground">&quot;Submit Review&quot;</strong> — your feedback is instant.</span>
          </li>
        </ol>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <FontAwesomeIcon icon={faUtensils} className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Festival and special meals are tagged with badges so you can provide specific feedback.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    title: 'QR Check-in',
    subtitle: 'Step 4 — Meal Attendance',
    icon: faQrcode,
    iconColor: 'text-cyan-500',
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Check in for your meals by scanning the QR code displayed at the hostel mess.
        </p>
        <ol className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">1</Badge>
            <span>Go to <strong className="text-foreground">Scan QR</strong> from the navigation menu.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">2</Badge>
            <span>Tap <strong className="text-foreground">&quot;Start Scanning&quot;</strong> and point your camera at the QR code.</span>
          </li>
          <li className="flex gap-2.5">
            <Badge variant="secondary" className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center p-0 text-[10px] font-bold mt-0.5">3</Badge>
            <span>A confirmation screen shows your meal check-in was <strong className="text-foreground">successful</strong>.</span>
          </li>
        </ol>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <FontAwesomeIcon icon={faCircleCheck} className="w-3.5 h-3.5 text-cyan-500 mt-0.5 shrink-0" />
          <p className="text-xs text-cyan-700 dark:text-cyan-400">
            Check-in is only available during the meal timing window configured by admin.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 6,
    title: 'History & Complaints',
    subtitle: 'Step 5 — Track & Report',
    icon: faClockRotateLeft,
    iconColor: 'text-purple-500',
    content: (
      <div className="space-y-3">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FontAwesomeIcon icon={faClockRotateLeft} className="w-3.5 h-3.5 text-purple-500" />
            Review History
          </h4>
          <p className="text-sm text-muted-foreground pl-5.5 leading-relaxed">
            View all your past reviews, edit ratings for today&apos;s meals, delete reviews, 
            and see admin replies to your feedback.
          </p>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 h-3.5 text-orange-500" />
            Complaints
          </h4>
          <p className="text-sm text-muted-foreground pl-5.5 leading-relaxed">
            Report issues by category — <em>Hygiene, Taste, Quantity, Timing, or Other</em>. 
            Track complaint status (Pending → In Progress → Resolved) and receive admin replies.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 7,
    title: 'Profile & Settings',
    subtitle: 'Step 6 — Your Account',
    icon: faUserGear,
    iconColor: 'text-rose-500',
    content: (
      <div className="space-y-3">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3 text-muted-foreground/60 mt-1 shrink-0" />
            <span>View your <strong className="text-foreground">Profile</strong> — Register ID, Name, Email, Hostel Block, Department, Year.</span>
          </li>
          <li className="flex gap-2.5">
            <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3 text-muted-foreground/60 mt-1 shrink-0" />
            <span><strong className="text-foreground">Edit</strong> your Name and Year if needed.</span>
          </li>
          <li className="flex gap-2.5">
            <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3 text-muted-foreground/60 mt-1 shrink-0" />
            <span><strong className="text-foreground">Change Password</strong> — enter current password, set a new one.</span>
          </li>
          <li className="flex gap-2.5">
            <FontAwesomeIcon icon={faLanguage} className="w-3 h-3 text-muted-foreground/60 mt-1 shrink-0" />
            <span>Switch <strong className="text-foreground">Language</strong> — English, தமிழ், हिन्दी, తెలుగు.</span>
          </li>
          <li className="flex gap-2.5">
            <FontAwesomeIcon icon={faMoon} className="w-3 h-3 text-muted-foreground/60 mt-1 shrink-0" />
            <span>Toggle <strong className="text-foreground">Dark / Light Mode</strong> using the theme button.</span>
          </li>
        </ul>
      </div>
    ),
  },
]

export function UserGuide() {
  const [open, setOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = guideSteps.length

  const goNext = () =>
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1))
  const goPrev = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

  const step = guideSteps[currentStep]

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCurrentStep(0)
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium group"
        aria-label="Open user guide"
      >
        <FontAwesomeIcon
          icon={faBookOpen}
          className="w-3.5 h-3.5 group-hover:scale-110 transition-transform"
        />
        <span>How to Use</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-hidden p-0 gap-0 rounded-2xl">
          {/* Header with step icon */}
          <div className="px-6 pt-6 pb-4">
            <DialogHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
                  >
                    <FontAwesomeIcon
                      icon={step.icon}
                      className={`w-5 h-5 ${step.iconColor}`}
                    />
                  </div>
                  <div>
                    <DialogTitle className="text-base">{step.title}</DialogTitle>
                    <DialogDescription className="text-xs mt-0.5">
                      {step.subtitle}
                    </DialogDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                  {currentStep + 1} / {totalSteps}
                </Badge>
              </div>
            </DialogHeader>
          </div>

          {/* Progress bar */}
          <div className="px-6">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={false}
                animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              />
            </div>
          </div>

          {/* Content area with animation */}
          <div className="px-6 py-5 min-h-[220px] overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {step.content}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer navigation */}
          <div className="px-6 pb-6 pt-2 flex items-center justify-between border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={currentStep === 0}
              className="gap-1.5 text-xs"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
              Back
            </Button>

            {/* Step dots */}
            <div className="flex gap-1.5">
              {guideSteps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                    i === currentStep
                      ? 'bg-primary w-4'
                      : i < currentStep
                      ? 'bg-primary/40'
                      : 'bg-muted-foreground/20'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {currentStep < totalSteps - 1 ? (
              <Button
                variant="default"
                size="sm"
                onClick={goNext}
                className="gap-1.5 text-xs"
              >
                Next
                <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => setOpen(false)}
                className="gap-1.5 text-xs"
              >
                Get Started
                <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
