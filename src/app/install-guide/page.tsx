'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faMobileScreen,
  faDownload,
  faShareNodes,
  faEllipsisVertical,
  faPlus,
  faArrowUpFromBracket,
  faCheck,
  faQrcode,
  faGlobe,
  faPrint,
  faCompass,
  faRobot,
} from '@fortawesome/free-solid-svg-icons'

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
}

function StepCard({
  step,
  title,
  description,
  icon,
  visual,
  index,
}: {
  step: number
  title: string
  description: string
  icon: typeof faDownload
  visual?: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={fadeUp}
      className="relative"
    >
      <div className="flex gap-5">
        {/* Step number */}
        <div className="shrink-0 flex flex-col items-center">
          <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-lg font-black shadow-lg shadow-primary/20 print:shadow-none">
            {step}
          </div>
          <div className="w-0.5 flex-1 bg-primary/10 mt-2 print:bg-gray-200" />
        </div>
        {/* Content */}
        <div className="pb-10 flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <FontAwesomeIcon icon={icon} className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>
          {visual && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm print:shadow-none print:border-gray-200">
              {visual}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** Fake browser chrome for screenshots */
function PhoneMockup({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="mx-auto max-w-[260px]">
      {label && <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest mb-2 text-center">{label}</p>}
      <div className="rounded-[20px] border-2 border-foreground/10 bg-background overflow-hidden shadow-xl print:shadow-none print:border-gray-300">
        {/* Status bar */}
        <div className="h-6 bg-foreground/5 flex items-center justify-center">
          <div className="w-16 h-1 rounded-full bg-foreground/15" />
        </div>
        {/* Content */}
        <div className="p-3">
          {children}
        </div>
        {/* Bottom bar */}
        <div className="h-4 bg-foreground/5 flex items-center justify-center">
          <div className="w-24 h-1 rounded-full bg-foreground/10" />
        </div>
      </div>
    </div>
  )
}

export default function InstallGuidePage() {
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android')

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* Print button — hidden when printing */}
      <div className="fixed top-4 right-4 z-50 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity"
        >
          <FontAwesomeIcon icon={faPrint} className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      {/* Hero Section */}
      <header className="px-6 pt-12 pb-8 text-center max-w-2xl mx-auto print:pt-6 print:pb-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-20 h-20 mx-auto mb-5 rounded-[22px] bg-primary/10 border-2 border-primary/20 flex items-center justify-center print:border-gray-300">
            <FontAwesomeIcon icon={faMobileScreen} className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground mb-2 print:text-2xl">
            Install the App
          </h1>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            Get the Hostel Food Review app on your phone for quick access to menus,
            meal check-in, and reviews — no app store needed.
          </p>
        </motion.div>
      </header>

      {/* Platform Tabs */}
      <div className="max-w-xl mx-auto px-6">
        <div className="flex bg-muted/50 border rounded-2xl p-1 mb-8 print:hidden">
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'android'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FontAwesomeIcon icon={faRobot} className="w-4 h-4" />
            Android
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'ios'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FontAwesomeIcon icon={faMobileScreen} className="w-4 h-4" />
            iPhone / iPad
          </button>
        </div>

        {/* ─── ANDROID STEPS ─── */}
        <div className={activeTab === 'android' ? 'block' : 'hidden print:block'}>
          <div className="mb-4 print:block hidden">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FontAwesomeIcon icon={faRobot} className="w-5 h-5 text-green-600" />
              Android (Chrome)
            </h2>
          </div>

          <StepCard
            step={1}
            title="Open in Chrome"
            description="Open Google Chrome on your Android phone and navigate to the Food Review website URL provided by your hostel administration."
            icon={faGlobe}
            index={0}
            visual={
              <PhoneMockup label="Chrome Browser">
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-3">
                  <FontAwesomeIcon icon={faGlobe} className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono truncate">hostel-food-review.vercel.app</span>
                </div>
                <div className="space-y-2">
                  <div className="h-8 bg-primary/10 rounded-lg" />
                  <div className="h-4 bg-muted/50 rounded w-3/4" />
                  <div className="h-4 bg-muted/50 rounded w-1/2" />
                </div>
              </PhoneMockup>
            }
          />

          <StepCard
            step={2}
            title='Tap the ⋮ menu'
            description='Tap the three-dot menu icon (⋮) at the top-right corner of Chrome to open the browser menu.'
            icon={faEllipsisVertical}
            index={1}
            visual={
              <PhoneMockup label="Tap the menu">
                <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg mb-3">
                  <span className="text-[10px] font-semibold text-foreground">Chrome</span>
                  <div className="w-7 h-7 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center animate-pulse">
                    <FontAwesomeIcon icon={faEllipsisVertical} className="w-3 h-3 text-primary" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted/40 rounded w-full" />
                  <div className="h-3 bg-muted/40 rounded w-4/5" />
                </div>
              </PhoneMockup>
            }
          />

          <StepCard
            step={3}
            title='"Add to Home screen"'
            description='In the menu, look for "Add to Home screen" or "Install app". Tap it to begin the installation process.'
            icon={faPlus}
            index={2}
            visual={
              <div className="space-y-1">
                {['New tab', 'New incognito tab', 'Bookmarks', 'History'].map((item) => (
                  <div key={item} className="px-3 py-2 text-xs text-muted-foreground rounded-lg">
                    {item}
                  </div>
                ))}
                <div className="px-3 py-2.5 text-xs font-bold text-primary bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-2">
                  <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                  Add to Home screen ←
                </div>
                {['Share...', 'Find in page'].map((item) => (
                  <div key={item} className="px-3 py-2 text-xs text-muted-foreground rounded-lg">
                    {item}
                  </div>
                ))}
              </div>
            }
          />

          <StepCard
            step={4}
            title="Confirm Install"
            description='A dialog will appear. Tap "Add" or "Install" to confirm. The app icon will appear on your home screen.'
            icon={faCheck}
            index={3}
            visual={
              <div className="p-4 bg-muted/30 rounded-xl text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
                  <span className="text-xl">🍽️</span>
                </div>
                <p className="text-xs font-bold text-foreground">Add to Home screen?</p>
                <p className="text-[10px] text-muted-foreground">&quot;Hostel Food Review&quot; will be added to your home screen</p>
                <div className="flex gap-2 justify-center">
                  <span className="px-4 py-1.5 bg-muted/50 text-xs text-muted-foreground rounded-lg">Cancel</span>
                  <span className="px-4 py-1.5 bg-primary text-xs text-primary-foreground font-semibold rounded-lg">Add</span>
                </div>
              </div>
            }
          />

          <StepCard
            step={5}
            title="You're All Set!"
            description="The app is now installed. Open it from your home screen — it launches fullscreen, just like a native app. No app store required!"
            icon={faCheck}
            index={4}
            visual={
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-500/10 rounded-xl border border-green-200 dark:border-green-500/20">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-lg">🍽️</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">Food Review</p>
                  <p className="text-[10px] text-muted-foreground">App installed on home screen ✓</p>
                </div>
              </div>
            }
          />
        </div>

        {/* ─── iOS STEPS ─── */}
        <div className={activeTab === 'ios' ? 'block' : 'hidden print:block'}>
          <div className="mb-4 print:block hidden print:mt-8 print:pt-4 print:border-t">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FontAwesomeIcon icon={faMobileScreen} className="w-5 h-5" />
              iPhone / iPad (Safari)
            </h2>
          </div>

          <StepCard
            step={1}
            title="Open in Safari"
            description="On your iPhone or iPad, open Safari (the default browser with a blue compass icon) and navigate to the Food Review website URL."
            icon={faCompass}
            index={0}
            visual={
              <PhoneMockup label="Safari Browser">
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-3">
                  <FontAwesomeIcon icon={faGlobe} className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-mono truncate">hostel-food-review.vercel.app</span>
                </div>
                <div className="space-y-2">
                  <div className="h-8 bg-blue-50 dark:bg-blue-500/10 rounded-lg" />
                  <div className="h-4 bg-muted/50 rounded w-3/4" />
                  <div className="h-4 bg-muted/50 rounded w-1/2" />
                </div>
              </PhoneMockup>
            }
          />

          <StepCard
            step={2}
            title="Tap the Share button"
            description='Tap the Share button (the square with an upward arrow ↑) at the bottom center of Safari.'
            icon={faArrowUpFromBracket}
            index={1}
            visual={
              <PhoneMockup label="Tap Share">
                <div className="space-y-2 mb-3">
                  <div className="h-6 bg-muted/30 rounded" />
                  <div className="h-4 bg-muted/20 rounded w-3/4" />
                </div>
                <div className="flex items-center justify-center gap-6 py-3 border-t">
                  <div className="text-muted-foreground text-xs">←</div>
                  <div className="text-muted-foreground text-xs">→</div>
                  <div className="w-8 h-8 rounded-lg bg-primary/15 border-2 border-primary flex items-center justify-center animate-pulse">
                    <FontAwesomeIcon icon={faArrowUpFromBracket} className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="text-muted-foreground text-xs">▢</div>
                  <div className="text-muted-foreground text-xs">⊞</div>
                </div>
              </PhoneMockup>
            }
          />

          <StepCard
            step={3}
            title='"Add to Home Screen"'
            description='Scroll down in the share sheet and tap "Add to Home Screen". You may need to scroll to find this option.'
            icon={faPlus}
            index={2}
            visual={
              <div className="space-y-1">
                {['Copy', 'Add Bookmark', 'Add to Reading List'].map((item) => (
                  <div key={item} className="px-3 py-2 text-xs text-muted-foreground rounded-lg">
                    {item}
                  </div>
                ))}
                <div className="px-3 py-2.5 text-xs font-bold text-primary bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-2">
                  <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                  Add to Home Screen ←
                </div>
                {['Find on Page', 'Print'].map((item) => (
                  <div key={item} className="px-3 py-2 text-xs text-muted-foreground rounded-lg">
                    {item}
                  </div>
                ))}
              </div>
            }
          />

          <StepCard
            step={4}
            title='Tap "Add"'
            description='A preview will show the app name and icon. Tap "Add" in the top-right corner to install the app on your home screen.'
            icon={faCheck}
            index={3}
            visual={
              <div className="p-4 bg-muted/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-medium">Cancel</span>
                  <span className="text-xs font-bold text-foreground">Add to Home Screen</span>
                  <span className="text-[10px] text-primary font-bold">Add</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-background rounded-xl border">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="text-lg">🍽️</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">Food Review</p>
                    <p className="text-[10px] text-muted-foreground font-mono">hostel-food-review.vercel.app</p>
                  </div>
                </div>
              </div>
            }
          />

          <StepCard
            step={5}
            title="Done!"
            description="The app appears on your home screen with a native-like icon. Tap it to open — it runs fullscreen without Safari's browser UI."
            icon={faCheck}
            index={4}
            visual={
              <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-500/10 rounded-xl border border-green-200 dark:border-green-500/20">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-lg">🍽️</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">Food Review</p>
                  <p className="text-[10px] text-muted-foreground">App installed on home screen ✓</p>
                </div>
              </div>
            }
          />
        </div>

        {/* ─── APP SHORTCUTS SECTION ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-4 mb-10 print:break-before-page"
        >
          <div className="rounded-2xl border bg-card p-6 shadow-sm print:shadow-none">
            <div className="flex items-center gap-2 mb-4">
              <FontAwesomeIcon icon={faMobileScreen} className="w-4 h-4 text-primary" />
              <h3 className="text-base font-bold text-foreground">App Shortcuts (Android)</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              On Android, <strong>long-press</strong> the app icon on your home screen to see quick shortcuts:
            </p>
            <div className="space-y-2">
              {[
                { name: 'Scan QR Check-in', desc: 'Quickly scan the meal QR code', icon: faQrcode },
                { name: 'File a Complaint', desc: 'Submit a food complaint directly', icon: faShareNodes },
                { name: 'Review History', desc: 'View your past reviews', icon: faDownload },
              ].map((shortcut) => (
                <div
                  key={shortcut.name}
                  className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={shortcut.icon} className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{shortcut.name}</p>
                    <p className="text-[10px] text-muted-foreground">{shortcut.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>Note:</strong> Home screen widgets are not available for web apps (PWAs).
                However, app shortcuts give you quick access to key features with a long-press on the app icon.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="text-center pb-10 print:pb-4">
          <p className="text-xs text-muted-foreground">
            Hostel Food Review System &bull; SCSVMV / Kanchi University
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Need help? Contact the hostel IT administrator.
          </p>
        </footer>
      </div>
    </div>
  )
}
