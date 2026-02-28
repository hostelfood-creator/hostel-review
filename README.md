# 🍽️ Hostel Food Review System

A full-stack web application for hostel students to rate daily meals, check in via QR codes, file complaints, and help management improve food quality through real-time analytics.

**Live Platform** · Built for SCSVMV University

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [User Roles](#user-roles)
- [Security](#security)
- [Internationalization](#internationalization)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [User Guide](#user-guide)
- [License](#license)

---

## Overview

The **Hostel Food Review System** allows hostel residents to provide instant feedback on daily meals — Breakfast, Lunch, Snacks, and Dinner. Administrators can view analytics, manage menus, handle complaints, and generate weekly reports. The platform supports multi-language feedback, QR-based meal attendance, and special meal/festival tagging.

### Key Highlights

- **Real-time meal reviews** with 1–5 star ratings, feedback tags, and text comments
- **QR Code check-in** for meal attendance tracking
- **Admin dashboard** with charts, sentiment analysis, and export-ready reports
- **Multi-language** support (English, Tamil, Hindi, Telugu)
- **Dark/Light mode** with system preference detection
- **PWA-ready** with manifest and mobile-first responsive design
- **Production security** — CSP with nonces, HSTS, CSRF protection, rate limiting

---

## Features

### Student Features

| Feature | Description |
|---------|-------------|
| **Meal Review** | Rate each meal (1–5 stars) with smart feedback tags and optional text review |
| **QR Check-in** | Scan QR codes at the mess to record meal attendance |
| **Review History** | View, edit, and delete past reviews; see admin replies |
| **Complaints** | Submit complaints by category (Hygiene, Taste, Quantity, Timing, Other) |
| **Profile Management** | Edit name, year; change password; view review statistics |
| **Daily Menu** | View today's menu items and meal timings |
| **Festival Meals** | Special meal badges for festival/event meals |
| **Notifications** | In-app notification feed for announcements |

### Admin Features

| Feature | Description |
|---------|-------------|
| **Analytics Dashboard** | Interactive charts (line, bar, pie) for ratings, sentiment, and trends |
| **Menu Management** | Set daily menus with items, timings, and special meal labels |
| **Complaint Management** | View, reply to, and resolve student complaints |
| **Review Management** | Reply to student reviews; filter by block, meal type, date range |
| **Attendance Tracker** | View QR check-in counts per meal and hostel block |
| **Weekly Reports** | Generate aggregated weekly stats with per-day breakdowns |
| **Meal Timings** | Configure custom meal timing windows |

### Super Admin Features

| Feature | Description |
|---------|-------------|
| **Hostel Block Management** | Add/edit/delete hostel blocks |
| **User Management** | View all users; upload student data via XLSX |
| **Maintenance Mode** | Toggle site-wide maintenance overlay |
| **Meal Timing Config** | System-wide meal window configuration |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) |
| **Runtime** | [React 19](https://react.dev/) |
| **Language** | TypeScript 5 |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL + Auth + RLS) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) |
| **UI Components** | [Radix UI](https://www.radix-ui.com/) primitives |
| **Icons** | [Font Awesome 7](https://fontawesome.com/) |
| **Charts** | [Recharts 2](https://recharts.org/) |
| **Animations** | [Framer Motion 12](https://www.framer.com/motion/) |
| **Rate Limiting** | [Upstash Redis](https://upstash.com/) (with in-memory fallback) |
| **Email** | [Nodemailer](https://nodemailer.com/) (OTP for password reset) |
| **QR Scanning** | [jsQR](https://github.com/nicolo-ribaudo/qr-scanner) (camera-based) |
| **Deployment** | [Vercel](https://vercel.com/) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                     │
│  Next.js App Router · React 19 · Tailwind · Framer     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│              Edge Middleware (middleware.ts)             │
│  CSP Nonces · Auth Session · CSRF · Route Guard        │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│                API Route Handlers                       │
│  /api/auth/* · /api/reviews · /api/analytics · etc.     │
│  Rate Limiting · Input Validation · Role Checks         │
└──────────┬──────────────────────────┬───────────────────┘
           │                          │
┌──────────▼──────────┐  ┌────────────▼─────────────────┐
│   Supabase Auth     │  │    Supabase PostgreSQL       │
│  JWT Sessions       │  │  profiles · reviews · menus  │
│  Cookie-based SSR   │  │  complaints · meal_checkins  │
└─────────────────────┘  │  hostel_blocks · etc.        │
                         │  Row Level Security (RLS)    │
                         └──────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**
- **Supabase** project (free tier works)
- **Upstash Redis** (optional — for distributed rate limiting)

### Installation

```bash
# Clone the repository
git clone https://github.com/hostelfood-creator/hostel-review.git
cd hostel-review

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local — see Environment Variables section

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# ── Supabase ────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Site URL ────────────────────────────────────
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# ── Rate Limiting (Upstash Redis — optional) ────
USE_REDIS=true
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# ── Email (Nodemailer — for password reset OTP) ─
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `NEXT_PUBLIC_SITE_URL` | Yes | Production site URL for CSRF validation |
| `USE_REDIS` | No | Enable Upstash Redis rate limiter (`true`/`false`) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis auth token |
| `SMTP_HOST` | No | SMTP server for password reset emails |
| `SMTP_PORT` | No | SMTP port (587 for TLS) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password or app-specific password |
| `SMTP_FROM` | No | Sender email address |

---

## Database Schema

The app uses the following Supabase (PostgreSQL) tables:

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts — register_id, name, email, role, hostel_block, department, year |
| `reviews` | Meal ratings — user_id, date, meal_type, rating (1–5), review_text, tags, sentiment, admin_reply |
| `complaints` | Complaint tickets — user_id, complaint_text, category, status, admin_reply |
| `menus` | Daily menus — date, meal_type, items, timing, special_label |
| `meal_checkins` | QR check-in records — user_id, date, meal_type |
| `meal_timings` | Configurable meal windows — meal_type, start_time, end_time |
| `hostel_blocks` | Hostel block master list — name |
| `notifications` | System notifications — title, message, target |
| `password_resets` | OTP tokens for password reset — email, otp, expires_at |
| `student_lookup` | University student records for auto-fill registration |

### Migration Scripts

Located in `/scripts/`:

- `migration-hostel-blocks.sql` — Hostel blocks table
- `migration-meal-checkins.sql` — Meal check-in table
- `migration-meal-timings.sql` — Meal timings table
- `password-resets-schema.sql` — Password reset OTP table
- `seed-super-admin.ts` — Create initial super admin account
- `seed-users.ts` — Seed student data from XLSX

---

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create new student account |
| `/api/auth/login` | POST | Sign in with Register ID + password |
| `/api/auth/logout` | POST | Sign out (clear session cookie) |
| `/api/auth/me` | GET | Get current authenticated user |
| `/api/auth/lookup` | GET | Look up student details by Register ID |
| `/api/auth/forgot-password/request` | POST | Request password reset OTP |
| `/api/auth/forgot-password/verify` | POST | Verify OTP and set new password |

### Student APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reviews` | GET | Get reviews (with pagination) |
| `/api/reviews` | POST | Submit a meal review |
| `/api/reviews` | PUT | Edit an existing review |
| `/api/reviews` | DELETE | Delete a review |
| `/api/checkin` | POST | Check in for a meal |
| `/api/complaints` | GET | Get user's complaints |
| `/api/complaints` | POST | Submit a new complaint |
| `/api/menu/today` | GET | Get today's menu |
| `/api/meal-timings` | GET | Get meal timing windows |
| `/api/profile` | GET/PUT | View/update profile |
| `/api/notifications` | GET | Get notification feed |
| `/api/time` | GET | Get server time (IST) |

### Admin APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analytics` | GET | Dashboard analytics (ratings, trends, sentiment) |
| `/api/admin/menu` | GET/POST/PUT/DELETE | CRUD daily menus |
| `/api/admin/meal-timings` | GET/POST | Manage meal timing config |
| `/api/admin/checkin` | GET | View check-in attendance data |
| `/api/reports/weekly` | GET | Weekly aggregated reports |
| `/api/blocks` | GET | List hostel blocks |
| `/api/admin/maintenance` | GET/POST | Toggle maintenance mode |
| `/api/admin/super` | POST | Super admin operations (blocks, users) |

All API routes are protected by:
- **Authentication** — Supabase session cookie
- **Authorization** — Role-based access (student, admin, super_admin)
- **Rate Limiting** — Async Redis-backed or in-memory
- **CSRF Protection** — Origin header validation
- **Input Validation** — Server-side sanitization

---

## User Roles

| Role | Permissions |
|------|-------------|
| `student` | Submit/edit/delete reviews, check in, file complaints, manage profile |
| `admin` | All student permissions + manage menus, reply to reviews/complaints, view analytics for assigned block |
| `super_admin` | All admin permissions + manage all blocks, user management, maintenance mode, global analytics |

---

## Security

The application implements production-grade security:

| Layer | Implementation |
|-------|----------------|
| **CSP** | Nonce-based Content Security Policy generated per-request in middleware |
| **HSTS** | Strict-Transport-Security with 2-year max-age, includeSubDomains, preload |
| **CSRF** | Origin header validation on all mutating requests |
| **Rate Limiting** | Async Upstash Redis rate limiter with in-memory fallback (per-IP) |
| **Auth** | Supabase JWT sessions via HTTP-only secure cookies |
| **RLS** | Row Level Security on all Supabase tables |
| **Input Sanitization** | Server-side validation on all user inputs |
| **Security Headers** | X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy |
| **Password Security** | Bcrypt hashing via Supabase Auth; minimum 8 characters enforced |
| **Session Management** | Remember Me = persistent session; unchecked = session cookie |
| **Cloudflare Ready** | `cf-connecting-ip` header support for real client IP behind CDN |

---

## Internationalization

The app supports 4 languages with full i18n:

| Language | Code | File |
|----------|------|------|
| English | `en` | `src/lib/i18n/translations/en.json` |
| Tamil (தமிழ்) | `ta` | `src/lib/i18n/translations/ta.json` |
| Hindi (हिन्दी) | `hi` | `src/lib/i18n/translations/hi.json` |
| Telugu (తెలుగు) | `te` | `src/lib/i18n/translations/te.json` |

Language preference is stored in `localStorage` and persists across sessions. Students can switch language from the navigation menu.

---

## Deployment

### Vercel (Recommended)

1. Push your repository to GitHub
2. Import the project in [Vercel](https://vercel.com/)
3. Set all environment variables in Vercel project settings
4. Deploy — Vercel auto-detects Next.js and builds accordingly

### Cloudflare (Optional CDN Layer)

Add Cloudflare in front of Vercel for:
- DDoS protection and bot mitigation
- WAF (Web Application Firewall) rules
- Global CDN caching
- Under Attack Mode for extreme traffic

The app already supports Cloudflare's `cf-connecting-ip` header for accurate rate limiting behind a CDN.

---

## Project Structure

```
hostel-food-review/
├── public/                      # Static assets (logo, manifest, icons)
├── scripts/                     # DB migration & seed scripts
│   ├── migration-*.sql          # PostgreSQL migration files
│   ├── seed-super-admin.ts      # Create super admin user
│   └── seed-users.ts            # Import student data from XLSX
├── src/
│   ├── middleware.ts             # Edge middleware (auth, CSP, CSRF, routing)
│   ├── app/
│   │   ├── layout.tsx            # Root layout (theme, i18n, preloader)
│   │   ├── globals.css           # Global styles (Tailwind base)
│   │   ├── login/page.tsx        # Login/Register page with User Guide
│   │   ├── student/              # Student pages
│   │   │   ├── page.tsx          # Dashboard (menu, ratings, reviews)
│   │   │   ├── checkin/          # QR check-in result page
│   │   │   ├── scan/             # QR scanner page
│   │   │   ├── history/          # Review history (edit/delete)
│   │   │   ├── complaints/       # Submit & track complaints
│   │   │   └── profile/          # Profile & password management
│   │   ├── admin/                # Admin pages
│   │   │   ├── page.tsx          # Analytics dashboard
│   │   │   ├── menu/             # Menu management
│   │   │   ├── reviews/          # Review management
│   │   │   ├── complaints/       # Complaint management
│   │   │   ├── attendance/       # Check-in attendance
│   │   │   ├── reports/          # Weekly reports
│   │   │   └── blocks/           # Hostel block management
│   │   └── api/                  # API route handlers
│   │       ├── auth/             # Authentication endpoints
│   │       ├── reviews/          # Review CRUD
│   │       ├── complaints/       # Complaint CRUD
│   │       ├── analytics/        # Dashboard analytics
│   │       ├── checkin/          # Meal check-in
│   │       ├── admin/            # Admin-only endpoints
│   │       └── ...               # Other endpoints
│   ├── components/
│   │   ├── user-guide.tsx        # Interactive User Guide dialog
│   │   ├── qr-scanner.tsx        # Camera QR code scanner
│   │   ├── maintenance-overlay.tsx
│   │   ├── preloader-wrapper.tsx
│   │   └── ui/                   # Radix-based UI primitives
│   └── lib/
│       ├── db.ts                 # Database query functions
│       ├── rate-limit.ts         # Async rate limiter (Redis + in-memory)
│       ├── theme.tsx             # Dark/light mode provider
│       ├── utils.ts              # Utility functions (cn, etc.)
│       ├── i18n/                 # Internationalization system
│       │   └── translations/     # Language JSON files
│       └── supabase/             # Supabase client configs
│           ├── client.ts         # Browser client
│           ├── server.ts         # Server component client
│           ├── service.ts        # Service role client (bypasses RLS)
│           └── middleware.ts     # Middleware client
├── next.config.js                # Next.js config (security headers)
├── tailwind.config.ts            # Tailwind CSS config
├── tsconfig.json                 # TypeScript config
└── package.json                  # Dependencies & scripts
```

---

## User Guide

An interactive **"How to Use"** guide is built into the login page, accessible via the 📖 **How to Use** link below the sign-in form.

The guide walks new students through 7 steps:

1. **Welcome** — Overview of platform features
2. **Create Account** — Registration with auto-fill from university records
3. **Sign In** — Login with Remember Me and password reset
4. **Rate Meals** — Submit 1–5 star ratings with feedback tags
5. **QR Check-in** — Scan QR codes for meal attendance
6. **History & Complaints** — Track reviews and file complaints
7. **Profile & Settings** — Manage account, language, and theme

The guide uses an animated dialog with step-by-step navigation, progress indicators, and contextual tips.

---

## License

This project is private and proprietary. All rights reserved.

---

<p align="center">
  Built with ❤️ for SCSVMV University Hostel Management
</p>
