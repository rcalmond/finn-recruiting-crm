# Finn Almond Recruiting CRM — Setup Guide

## Prerequisites
- Node 18+ (you have 25)
- A Supabase account (free tier is plenty)
- A Vercel account (free tier works)
- A GitHub account for GitOps

---

## 1. Supabase Setup

### 1a. Create project
1. Go to supabase.com → New project
2. Name it `finn-recruiting-crm`
3. Pick a strong database password (save it somewhere)
4. Region: US West (closest to San Diego)

### 1b. Run migrations
In the Supabase dashboard → SQL Editor → New query:

1. Paste and run `supabase/migrations/001_initial_schema.sql`
2. Paste and run `supabase/migrations/002_seed_schools.sql`

### 1c. Get credentials
Settings → API → copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 1d. Create the two user accounts
Authentication → Users → Add user:
- Randy: your email + password
- Finn: his email + password

> Both users get full read/write access (RLS policies allow all authenticated users).

---

## 2. Local Development

```bash
cd finn-recruiting-crm

# Install dependencies
npm install

# Copy env file and fill in your Supabase values
cp .env.local.example .env.local
# Edit .env.local with your URL and anon key

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## 3. GitHub + Vercel Deployment

### 3a. Push to GitHub
```bash
git init
git add .
git commit -m "Initial scaffold"
gh repo create finn-recruiting-crm --private --source=. --push
```

### 3b. Deploy on Vercel
1. vercel.com → New Project → Import from GitHub → select `finn-recruiting-crm`
2. Framework: Next.js (auto-detected)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

### 3c. GitOps flow going forward
```bash
# Make changes locally
git add -p
git commit -m "feat: describe your change"
git push
# Vercel auto-deploys on push to main
```

---

## 4. Real-time Sync

Real-time is handled by Supabase's Postgres CDC (Change Data Capture).
The three tables are added to `supabase_realtime` publication in migration 001.
Both Randy and Finn will see changes within ~1 second of each other automatically.

No extra configuration needed — it just works once the tables are published.

---

## 5. Adapting the Original Prototype

When you share the actual path to `recruiting_crm.jsx`, I'll:
1. Port the exact school list (replacing the seed SQL)
2. Match the UI layout and colors precisely
3. Carry over any custom logic (scoring, notes format, etc.)

---

## File Structure

```
finn-recruiting-crm/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Redirects to /dashboard
│   │   ├── auth/
│   │   │   ├── login/page.tsx  # Login form
│   │   │   └── callback/route.ts
│   │   └── dashboard/page.tsx  # Main app (server component + auth check)
│   ├── components/
│   │   ├── DashboardClient.tsx  # Tab shell + nav
│   │   ├── StatsBar.tsx         # 4-stat summary row
│   │   ├── PipelineTable.tsx    # Filterable school table
│   │   ├── ActionItemsPanel.tsx # To-do list with overdue flagging
│   │   ├── ContactLogPanel.tsx  # Log with paste-email support
│   │   ├── EmailTemplatesPanel.tsx # 5 draft templates
│   │   └── SchoolModal.tsx      # Add/edit school + contact log view
│   ├── hooks/
│   │   └── useRealtimeData.ts   # Supabase realtime hooks for all tables
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts        # Browser Supabase client
│   │   │   └── server.ts        # Server Component Supabase client
│   │   ├── types.ts             # TypeScript types
│   │   └── utils.ts             # cn(), formatDate(), color helpers
│   └── middleware.ts            # Auth redirect guard
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  # Tables + RLS + realtime
│       └── 002_seed_schools.sql    # 63 pre-loaded schools
├── .env.local.example
├── vercel.json
└── SETUP.md
```
