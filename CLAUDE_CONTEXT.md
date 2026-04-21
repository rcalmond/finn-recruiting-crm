# Finn Almond — College Soccer Recruiting App: Claude Context File

> **How to use:** Drop this file in the root of the repo. At the start of a Claude Code session,
> say: "Read CLAUDE_CONTEXT.md before we start."
>
> **To update the pipeline section:** `npm run export-context`
> (regenerates Section 10 from live Supabase data; all other sections are static)

---

## 1. What This App Is

A personal recruiting CRM for **Randy Almond** (parent/manager) and **Finn Almond** (player).
Data lives in Supabase. Frontend is Next.js + React + TypeScript deployed on Vercel.
The app tracks ~50 active target schools across division, coaching contacts, outreach status,
contact logs, and next actions.

Randy drives strategy and outreach. Finn handles player-facing tasks (RQs, emails from his
account, Sports Recruits profile management).

---

## 2. The Athlete

| Field | Value |
|---|---|
| Name | Finn Almond |
| Grad Year | 2027 |
| DOB | November 15, 2008 |
| Position | **Left Wingback** (primary) — transitioned from Striker/Winger in Nov 2025 |
| Club | Albion SC Colorado MLS NEXT Academy (U19) |
| High School | Alexander Dawson School, Lafayette, CO |
| GPA | 3.78 weighted / 3.57 unweighted |
| SAT | 1340 |
| Honors | National Honor Society |
| AP Courses | AP Calculus AB, AP Chemistry, AP U.S. History |
| Academic Interest | Mechanical Engineering or Aerospace Engineering |
| Email | finnalmond08@gmail.com |

---

## 3. Key Recruiting Assets

| Asset | URL / Notes |
|---|---|
| Highlight Reel | https://www.youtube.com/watch?v=Va_Z09OYcs0 — **public, lead with this** |
| Full Game Film | https://youtu.be/Zzp-YMma_8g — unlisted, **offer on request only** |
| Sports Recruits | https://my.sportsrecruits.com/athlete/finn_almond |

---

## 4. Database Schema

### Table: `schools`
```
id                  uuid PK
name                text
short_name          text
category            'A' | 'B' | 'C' | 'Nope'       -- recruiting tier
division            'D1' | 'D2' | 'D3'
conference          text
location            text
status              'Not Contacted' | 'Intro Sent' | 'Ongoing Conversation' |
                    'Visit Scheduled' | 'Offer' | 'Inactive'
last_contact        date
head_coach          text
coach_email         text
admit_likelihood    'Likely' | 'Target' | 'Reach' | 'Far Reach'
rq_status           text   -- e.g. "Completed", "To Do", "Updated"
videos_sent         boolean
notes               text
created_at          timestamptz
updated_at          timestamptz
```

### Table: `action_items`
```
id          uuid PK
school_id   uuid FK → schools.id (cascade delete)
action      text
owner       'Finn' | 'Randy' | null
due_date    date
sort_order  integer   -- persistent manual priority order
created_at  timestamptz
```

### Table: `contact_log`
```
id          uuid PK
school_id   uuid FK → schools.id (cascade delete)
date        date
channel     'Email' | 'Phone' | 'In Person' | 'Text' | 'Sports Recruits'
direction   'Outbound' | 'Inbound'
coach_name  text
summary     text
created_by  uuid FK → auth.users.id
created_at  timestamptz
```

### Table: `assets`
```
id            uuid PK
name          text                          -- display name
type          'resume' | 'transcript' | 'highlight_reel' | 'game_film' |
              'sports_recruits' | 'link' | 'other'
category      'file' | 'link'
storage_path  text                          -- Supabase Storage path (files only)
file_name     text                          -- original filename (files only)
file_size     integer                       -- bytes (files only)
mime_type     text                          -- (files only)
url           text                          -- (links only)
description   text
is_current    boolean                       -- false = archived version
version       integer
replaced_by   uuid FK → assets.id
uploaded_by   uuid FK → auth.users.id
created_at    timestamptz
```

### Table: `questions`
```
id          uuid PK
question    text
rationale   text
category    'formation' | 'roster' | 'development' | 'culture' | 'aid'
is_custom   boolean                         -- true = user-added, false = seeded default
sort_order  integer
created_at  timestamptz
updated_at  timestamptz
```

### Table: `school_question_overrides`
```
id           uuid PK
school_id    uuid FK → schools.id (cascade delete)
question_id  uuid FK → questions.id (cascade delete)
status       'priority' | 'answered' | 'skip'
context_note text                           -- what we know, or why it's priority
created_at   timestamptz
updated_at   timestamptz
-- unique constraint on (school_id, question_id)
```

### Table: `school_specific_questions`
```
id            uuid PK
school_id     uuid FK → schools.id (cascade delete)
question_text text
rationale     text
category      'formation' | 'roster' | 'development' | 'culture' | 'aid'
created_at    timestamptz
updated_at    timestamptz
```

### RLS
All tables have RLS enabled. Any authenticated user gets full access.
Use the **service role key** in scripts/server-side code to bypass RLS.
Use the **anon key** in the frontend (Next.js client components).
---

## 5. Email Subject Line Format

```
Finn Almond | Left Wingback | Class of 2027 | [School Name]
```

All outreach since Nov 2025 uses this format. Pre-Nov 2025 emails used a striker framing
and are legacy — note this in contact log if surfaced.

---

## 6. Outreach Channel Strategy

- **Sports Recruits**: Primary channel for initial outreach
- **Direct Email**: Escalate to direct email for Tier A schools with no SR response after 2+ attempts
- **Rule**: Never use both channels simultaneously for the same school
- **Colorado School of Mines**: All outreach on hold — HC vacancy. Resume when new HC announced.

---

## 7. Recruiting Philosophy (informs feature decisions)

- The striker → LWB transition (Nov 2025) is the central narrative in all current outreach
- Engineering program quality = weighted equally with soccer fit; schools without real engineering deprioritized
- Highlight reel is always the lead asset; full game film only on request
- Coach emails: under 200 words, school-specific, never templated generically
- Category A schools get maximum personalization: specific engineering program refs, prior interaction context

---

## 8. Tech Stack

- **Frontend**: Next.js + React + TypeScript
- **Database**: Supabase (PostgreSQL) with RLS enabled
- **Auth**: Supabase Auth
- **Styling**: Tailwind CSS
- **Deployment**: Vercel
- **Key paths**:
  - `src/lib/types.ts` — TypeScript types (School, ContactLogEntry, ActionItem, etc.)
  - `src/lib/supabase.ts` — Supabase client initialization
  - `supabase/migrations/` — schema (001) and seed (002) files
  - `scripts/generate-claude-context.ts` — this script

---

## 9. Session Startup Checklist for Claude Code

1. Read `CLAUDE_CONTEXT.md` (this file)
2. Skim `src/lib/types.ts` to confirm current type definitions
3. Ask Randy: "Any pipeline changes or new coaching contacts since last session?"
4. Always match DB queries to exact column names in Section 4
5. Never hardcode school names, coach names, or emails — pull from DB
6. If touching the schools table, confirm whether the change should also update `updated_at`
   (the trigger handles this automatically on UPDATE)

---

## 10. Live Pipeline — Generated April 20, 2026

**Active schools: 32** | Overdue actions: 30
(Category Nope and status Inactive excluded)

### Tier A — Highest Priority (8 schools)

SCHOOL: Cal Poly San Luis Obispo (Cal Poly SLO)
  Status: Intro Sent
  Division: D1 — Big West
  Location: San Luis Obispo, CA
  Admit Likelihood: Reach
  Coach: Oige Kennedy — Head Coach <okennedy@calpoly.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-18
  Contact Log (1 shown):
    [2026-04-03] Inbound via Sports Recruits — Brandon Bautista:
      Hi Finn,
      
      Thanks for reaching out!
      
      We will be hosting an ID camp on May 9-10 & August 1-2 that you can attend.
      It’ll be a great opportunity to get in front of our staff in a training and
      match environment as we continue to recruit for 2027. If you’re interested,
      you can register at the link belo...

SCHOOL: Case Western
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Cleveland, OH
  Admit Likelihood: Reach
  Coach: Carter Poe — Head Coach <ccp51@case.edu>
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Notes: In AZ
Complete Schedule Form
Filled out schedule form for MLS NEXT Fest
  Next Action: Wingback update email (Finn) — due 2026-04-18
  Contact Log (1 shown):
    [2025-12-02] Inbound via Sports Recruits — Carter Poe:
      Finn, Thanks for reaching out. If you'd like to get on our schedule, please
      fill out the form below. https://forms.gle/V5d8u9oc3F8VYHGr8 Coach Poe

SCHOOL: CO School of Mines
  Status: Ongoing Conversation
  Division: D2 — RMAC
  Location: Golden, CO
  Admit Likelihood: Target
  Coach: Ben Fredrickson — Interim Assistant Coach [primary] ⚠ needs_review
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes, absolutely follow up — and the timing actually sets up well. Here's the reasoning:Why this rejection doesn't close the door:
It came from an assistant coach (Ben Fredrickson), not Mulholland, and was based on seeing Finn play as a striker at an ID camp.
The program is now in a coaching transition — a new head coach means a new recruiting board, new positional needs, and fresh eyes. The old rejection carries much less weight.
Finn is a different player now — left wingback at MLS NEXT Academy level, with an Olympico and stronger film than he had in February.
The play: Wait for the hire, then reach out to the new head coach directly.Don't reply to Fredrickson's rejection email, and don't reference the camp result. Start fresh with the new HC as if it's a first contact, because functionally it is. Frame it around the new position, current form, and genuine interest in Mines as an engineering school.

Signed up for Feb 7, 2026 ID Camp
Played meh and got rejection email
Did ID CAMP #1 - June 7-8, 2025
Emailed on 3/15 with update
Emailed about PHX on 2/12 (responded)
  Next Action: Check for new HC (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-05-29
  Contact Log (1 shown):
    [2025-12-01] Inbound via Sports Recruits — Greg Mulholland:
      See you out there Finn!
      
      <https://minesathletics.com/sports/mens-soccer>

SCHOOL: Lafayette College
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Easton, PA
  Admit Likelihood: Reach
  Coach: Dennis Bohn — Head Coach <bohnd@lafayette.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Notes: ID Camp in FL
In Arizona
  Next Action: Wingback update email (Finn) — due 2026-04-18
  Contact Log (2 shown):
    [2026-04-08] Inbound via Sports Recruits — Gabriel Robinson:
      Finn,
      
      Thank you for the email reaching out and touching base with us. Please keep
      us updated on your schedule moving forward. Please also see the information
      below providing more insight into our college, program, and PPA ID camps.
      
      Summer ID camp information
      
      https://peakperformancesoccer.com/
      ...
    [2025-12-01] Inbound via Sports Recruits — Gabriel Robinson:
      Finn, Thank you for the email reaching out and touching base with us. We
      will be attending the event and will plan on attending a match. Please keep
      us updated on any schedule changes. Please also see the information below
      providing more insight into our college, program, and winter ID camp.
      
      htt...

SCHOOL: Milwaukee School of Engineering (MSOE)
  Status: Ongoing Conversation
  Division: D3 — Northern Athletics Collegiate Conference (NACC)
  Location: Milwaukee, WI
  Admit Likelihood: Likely
  Coach: Rob Harrington — Head Coach <harrington@msoe.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Notes: What do you want to study?
  Next Action: Reply to "Let's connect in May" (Finn) — due 2026-05-03
  Contact Log (3 shown):
    [2026-04-08] Inbound via Sports Recruits — Rob Harrington:
      Finn,
      
      Let's connect in May.
      
      Rob H
      
      Rob Harrington
      
      Head Men’s Soccer Coach
      
      414-803-4769 cell
      
      NACC Regular or Conference Tournament Champs in 2025, 24, 23, 22, 21 Spring
      Covid, 2018, 2015, 2014
      
      Over 80% of MSOE soccer players received internships in their field (over
      50% get two or more)
      
      99%...
    [2025-12-05] Inbound via Sports Recruits — Rob Harrington:
      What’s your jersey number
      
      Get Outlook for iOS <https://aka.ms/o0ukef>
    [2025-12-04] Inbound via Sports Recruits — Rob Harrington:
      What would you like to study?
      
      Rob H
      
      Rob Harrington
      
      Head Men’s Soccer Coach
      
      414-803-4769 cell
      
      Average Graduate Starting Salary $76,647
      
      Number 12 School for starting salaries in the country
      
      99% of graduates get a job in their field
      
      NACC Regular or Conference Tournament Champs in 2025, 24, 2...

SCHOOL: RPI
  Status: Intro Sent
  Division: D3 — Liberty League
  Location: Troy, NY
  Admit Likelihood: Reach
  Coach: Adam Clinton — Head Coach <clinta@rpi.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes

SCHOOL: University of Rochester
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Rochester, NY
  Admit Likelihood: Target
  Coach: Ben Cross — Head Coach <bc006j@sports.rochester.edu> [primary]
  Last Contact: 2026-04-12
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Got a personalized email back from Coach Cross.

Thanks for reaching out about your interest. I am impressed with your film as you show great technical skill to take on defenders and provide amazing services from the wide areas. I also like how seriously you take your academics and are interested in
  Contact Log (2 shown):
    [2026-04-20] Inbound via Sports Recruits — Ben Cross:
      Finn,
      
      Let's plan for Wednesday at 2pm MT. I will call then!
      
      Best,
      
      *Sean Streb*
      
      Rochester Men’s Soccer – Assistant Coach
      
      [image: Blue text on a black background<br><br>Description automatically
      generated]
      
      *Recruiting Questionnaire*
      <https://questionnaires.armssoftware.com/0fbb1bedbe0c>
      
      *Jun...
    [2026-04-03] Inbound via Sports Recruits — Ben Cross:
      Finn,
      
      Thanks for reaching out about your interest. I am impressed with your film
      as you show great technical skill to take on defenders and provide amazing
      services from the wide areas. I also like how seriously you take your
      academics and are interested in our Hajim School of Engineering.
      
      Plea...

SCHOOL: WPI
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Target
  Coach: Brian Kelley — Head Coach <bkelley@wpi.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-18

### Tier B (12 schools)

SCHOOL: Bucknell University
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Lewisburg, PA
  Admit Likelihood: Reach
  Coach: Dave Brandt — Head Coach <db055@bucknell.edu> [primary]
  Coach: David Yates — Assistant Coach
  Coach: Casey Penrod — Assistant Coach
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Phoenix
High Press
Strong Mental Game
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20
  Contact Log (2 shown):
    [2025-12-03] Inbound via Sports Recruits — Dave Brandt:
      *Finn-appreciate you reaching out; we are now at the point where we will
      begin to look closely at 27’s, so good to hear from you. A ton of very
      relevant and specific info below on both Bucknell and all aspects of what
      is a unique and successful program culture.*
      
      1. first, we will look closely at...
    [2025-11-28] Inbound via Sports Recruits — Dave Brandt:
      *Finn-appreciate you reaching out; we are now at the point where we will
      begin to look closely at 27’s, so good to hear from you. A ton of very
      relevant and specific info below on both Bucknell and all aspects of what
      is a unique and successful program culture.*
      
      1. first, we will look closely at...

SCHOOL: Cal Poly Pomona
  Status: Intro Sent
  Division: D2 — CCAA (D2)
  Location: Pomona, CA
  Admit Likelihood: Likely
  Coach: Matt O'Sullivan — Head Coach <mosulliv@cpp.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: Carnegie Mellon
  Status: Ongoing Conversation
  Division: D3 — UAA
  Location: Pittsburgh, PA
  Admit Likelihood: Far Reach
  Coach: Brandon Bowman — Head Coach <bhbowman@andrew.cmu.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Played ok but not great. Got middling respone from Coach Macklin
Attended ID Camp in September 2025
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20
  Contact Log (3 shown):
    [2026-04-03] Inbound via Sports Recruits — Brandon Bowman:
      Thank you Finn.
    [2025-10-13] Inbound via Sports Recruits — Ross Macklin:
      Hi Finn - thanks for reaching back out and for your efforts during camp. We
      thought you showed a lot of qualities. However, in the interest of
      transparency, as things stand, there are other players in our pool that are
      ahead of you for the '27 class. Still, the recruiting process is very fluid
      an...
    [2025-09-23] Inbound via Sports Recruits — Ross Macklin:
      Hi Finn - looking forward to seeing you Sunday.

SCHOOL: Cornell
  Status: Intro Sent
  Division: D1 — Ivy League
  Location: Ithaca, NY
  Admit Likelihood: Far Reach
  Coach: John Smith — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: Updated (no email yet)
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: Illinois Institute of Technology (Illinois Tech)
  Status: Intro Sent
  Division: D3 — Northern Athletics Collegiate Conference (NACC)
  Location: Chicago, IL (Bronzeville, near downtown)
  Admit Likelihood: Target
  Coach: Marlon McKenzie — Head Coach <mmckenzie1@illinoistech.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: Lehigh University
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Bethlehem, PA
  Admit Likelihood: Reach
  Coach: Dean Koski — Head Coach <dk0a@lehigh.edu> [primary]
  Coach: Ryan Hess — Associate Head Coach
  Coach: Matt Giacalone — Assistant Coach
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Arizona
  Next Action: Wingback email update (Finn) — due 2026-04-18
  Also: Update RQ (Finn) — due 2026-04-20
  Contact Log (1 shown):
    [2025-11-28] Inbound via Sports Recruits — Will Flannery:
      Finn,
      
      Thank you for your email and for your interest in Lehigh University & our
      Men’s Soccer program. We will make every effort to attend one of your
      matches at the upcoming event.
      
      In the meantime, please fill out the questionnaire (linked below) to be
      added to our recruiting database, and see ...

SCHOOL: Middlebury
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Middlebury, VT
  Admit Likelihood: Far Reach
  Coach: Alex Elias — Head Coach <aelias@middlebury.edu>
  Coach: Tim Peng — Assistant Coach <tp@middlebury.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Personal Intro
ID Camp Info
  Contact Log (3 shown):
    [2026-04-20] Inbound via Sports Recruits — Tim Peng:
      That’s great to hear-
      
      Here’s the link as well https://www.middleburysoccercamps.com
      
      I think we will be a strong team in the fall
      
      Tim Peng Assistant Men’s Soccer Coach Middlebury College
    [2026-04-08] Inbound via Sports Recruits — Tim Peng:
      Hope that event went well!
      
      Want to come out to our camp in May? I can share the link if you need it
      
      Tim Peng Assistant Men’s Soccer Coach Middlebury College
    [2025-12-04] Inbound via Sports Recruits — Alex Elias:
      Thanks, Finn!

SCHOOL: Northeastern
  Status: Intro Sent
  Division: D1 — CAA
  Location: Boston, MA
  Admit Likelihood: Reach
  Coach: Jeremy Bonomo — Head Coach <j.bonomo@northeastern.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: Rochester Institute of Technology (RIT)
  Status: Intro Sent
  Division: D3 — Liberty League
  Location: Rochester, NY (Henrietta suburb)
  Admit Likelihood: Target
  Coach: Bill Garno — Head Coach <bill.garno@rit.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: South Dakota Mines (South Dakota School of Mines & Technology)
  Status: Ongoing Conversation
  Division: D2 — Rocky Mountain Athletic Conference (RMAC)
  Location: Rapid City, SD
  Admit Likelihood: Likely
  Coach: Teren Schuster — Head Coach <Teren.Schuster@sdsmt.edu> [primary]
  Last Contact: 2026-04-15
  RQ Status: Completed
  Videos Sent: Yes
  Next Action: Respond to email from Coach Schuster (Finn) — due 2026-04-15
  Contact Log (2 shown):
    [2026-04-20] Inbound via Sports Recruits — Teren Schuster:
      Hi Finn,
      
      Too bad, we are nearly finished with training, this is our last week. Send
      me your league schedule and I'll see if I can swing down and watch you play
      
      Teren Schuster, Head Men's Soccer Coach
      
      Hardrocker Men’s Soccer
      
      South Dakota Mines
      
      501 E. Saint Joseph St., Rapid City, SD 57701
      
      O:...
    [2026-04-15] Inbound via Sports Recruits — Teren Schuster:
      Hi Finn,
      
      Thank you for showing interest in our program. Happy to hear you are
      interested not only in our soccer program, but what our university has to
      offer academically. After watching your highlights, you will be
      on our radar.
      
      Please fill out our recruiting questionnaire so you are in our da...

SCHOOL: Stevens Institute of Technology
  Status: Intro Sent
  Division: D3 — MAC Freedom (Middle Atlantic Conference)
  Location: Hoboken, NJ
  Admit Likelihood: Reach
  Coach: Dale Jordan — Head Coach <djordan@stevens.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20

SCHOOL: Washington University
  Status: Intro Sent
  Division: D3 — UAA
  Location: St. Louis, MO
  Admit Likelihood: Far Reach
  Coach: Andrew Bordelon — Head Coach <bordelon@wustl.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-19
  Also: Update RQ (Finn) — due 2026-04-20
  Contact Log (1 shown):
    [2026-04-02] Inbound via Sports Recruits — Jack Mathis:
      Hello,
      
      Thank you so much for reaching out to Wash U Men's Soccer. I "Jack Mathis"
      have left the position as of 1/9/26 and will no longer be responding to
      emails for Wash U in St. Louis. Please reach out to Coach Bordelon for all
      questions regarding Wash U Men's Soccer. His email is bordelon@wust...

### Tier C — Exploratory (12 schools)

SCHOOL: Amherst
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Amherst, MA
  Admit Likelihood: Far Reach
  Coach: Justin Serpone — Head Coach <jserpone@amherst.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: FL ID camp (2/6-2/8)
Arizona?
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (3 shown):
    [2026-04-06] Inbound via Sports Recruits — Rye Jaran:
      Hi Finn,
      
      Thank you for reaching out and for your interest in Amherst College and our
      soccer program.
      
      Most recently, we won the 2024 National Championship, and we’ve reached the
      Final Four four times in the last six seasons.
      
      Amherst Men's Soccer <https://new.express.adobe.com/webpage/VmbEWqgaBK...
    [2026-04-04] Inbound via Sports Recruits — Justin Serpone:
      Hi Finn,
      
      Thank you for your interest in Amherst College and our soccer program.
      
      Over the past 17 years, our program is 275-44-44 -*it’s been a special time
      to be part of Amherst Men’s Soccer*.
      
      In 2024, we won the National Championship. We've been to the Final Four 4
      times in the past 6 seasons...
    [2026-03-05] Inbound via Sports Recruits — Justin Serpone:
      I hope you’re having a good Winter season! A number of 2027’s have reached
      out to set up a phone call. Unfortunately, we don't have the bandwidth to
      connect individually with all interested players, but we're going to have
      an informational Zoom for those who have expressed interest in connecting....

SCHOOL: Bowdoin
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Brunswick, ME
  Admit Likelihood: Far Reach
  Coach: Scott Wiercinski — Head Coach <swiercin@bowdoin.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Coach Banadda will be in AZ
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (2 shown):
    [2026-04-03] Inbound via Sports Recruits — Scott Wiercinski:
      Finn,
      
      Thank you for your interest in our Bowdoin Soccer program.  We are excited
      to learn more about you and watch you compete in the months
      ahead. Unfortunately, we are not able to attend your Scottsdale event due
      to commitments elsewhere.  We wish you the best of luck.
      
      We recently published o...
    [2025-12-04] Inbound via Sports Recruits — Scott Wiercinski:
      Thanks Finn.
      
      Good luck.
      
      Sincerely,
      
      Scott Wiercinski
      
      Head Coach – Men’s Soccer
      
      Bowdoin College
      
      9000 College Station
      
      Brunswick, Maine 04011
      
      (O): 207.725.3665
      
      (F): 207.725.3019
      
      Bowdoin College <http://www.bowdoin.edu/>
      
      Bowdoin College Men's Soccer
      <http://athletics.bowdoin.edu/sports/msoc...

SCHOOL: Clark
  Status: Intro Sent
  Division: D3 — NEWMAC
  Location: Worcester, MA
  Admit Likelihood: Likely
  Coach: Samuel Matteson — Head Coach <smatteson@clarku.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Notes: Sent MIT camp follow up email
Has a shared engineering program with Columbia
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27

SCHOOL: Colby
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Waterville, ME
  Admit Likelihood: Far Reach
  Coach: Sean Elvert — Head Coach <selvert@colby.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Arizona
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (2 shown):
    [2026-04-03] Inbound via Sports Recruits — Sean Elvert:
      Finn,
      
      Thanks for checking in with your continued interest in our program - if you
      could let us know the events you’ll be attending with your team or as an
      individual this spring/summer, that would be great.
      
       [image: Picture 1397805423, Picture]
      
      Sean Elvert
      
      *Head Men’s Soccer Coach  *
      
      *Colby ...
    [2025-11-29] Inbound via Sports Recruits — Sean Elvert:
      Finn,
      
      Thanks for reaching out with your interest in our program ahead of Fest -
      we enjoyed the highlight video and will be sure to take in a couple halves
      of yours in Phoenix.
      
      Prior to the event, please complete the recruit questionnaire in the
      signature below.
      
       [image: Picture 1397805423, Pic...

SCHOOL: Colgate
  Status: Ongoing Conversation
  Division: D1 — Patriot League
  Location: Hamilton, NY
  Admit Likelihood: Reach
  Coach: Erik Ronning — Head Coach <eronning@colgate.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Yes in Az
Will try to see a game
No engineering program, but has applied mathematics and other hard sciences
Emailed about MIT Camp and Coach Brown responded. Not going to be at the camp. Are starting to work on 2027s. Invited to their camp which is on August 1-2.
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (1 shown):
    [2025-12-02] Inbound via Sports Recruits — Tim Stanton:
      Thank you for reaching out with your schedule and for your interest in
      Colgate Men's Soccer. We are looking forward to seeing you play in next few
      days. Good luck! – Coach Stanton

SCHOOL: Dartmouth
  Status: Intro Sent
  Division: D1 — Ivy League
  Location: Hanover, NH
  Admit Likelihood: Far Reach
  Coach: Connor Klekota — Head Coach [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Notes: Sent MIT camp follow up email, but no response
No interaction with Finn
Has Engineering program combined with AB program
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27

SCHOOL: Emory
  Status: Intro Sent
  Division: D3 — UAA
  Location: Atlanta, GA
  Admit Likelihood: Reach
  Coach: Cory Greiner — Head Coach <cgreiner@emory.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27

SCHOOL: Northwestern
  Status: Ongoing Conversation
  Division: D1 — Big Ten
  Location: Evanston, IL
  Admit Likelihood: Far Reach
  Coach: Russell Payne — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: ID Camp
RQ
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (1 shown):
    [2025-11-30] Inbound via Sports Recruits — Russell Payne:
      Hi Finn,
      
      Thank you for your interest in our university and soccer program!
      
      As a potential 2027 recruit with limited opportunities to watch you play, I
      think it would be a good idea to consider our upcoming Winter ID Camps.
      These camps give you the best chance to be exposed to the Northwestern
      c...

SCHOOL: Princeton
  Status: Ongoing Conversation
  Division: D1 — Ivy League
  Location: Princeton, NJ
  Admit Likelihood: Far Reach
  Coach: Jim Barlow — Head Coach <jimbarlo@princeton.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Academics
Test Scores
Events
Not in Arizona
  Next Action: Update RQ (Finn) — due 2026-04-27
  Contact Log (1 shown):
    [2025-11-28] Inbound via Sports Recruits — Steve Totten:
      Finn,
      
      Thanks for your email and interest in Princeton Soccer.  Hopefully we are
      able to watch more this year.  We just wrapped up a very successful season
      and we are doing our best to turn our attention towards recruiting, though
      it will take us some time to catch up on things.  We have had a bu...

SCHOOL: Stanford
  Status: Ongoing Conversation
  Division: D1 — ACC (men's soccer starting 2024)
  Location: Stanford, CA
  Admit Likelihood: Far Reach
  Coach: Jeremy Gunn — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: To Do
  Videos Sent: Yes
  Notes: In Arizona
ID Camp
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (1 shown):
    [2025-11-28] Inbound via Sports Recruits — Drew Hutchins:
      Hi Finn,
      
      Thank you for reaching out and expressing interest in our team. We're
      always excited to hear from dedicated student-athletes who are passionate
      about competing at the highest level on the field and in the classroom.
      
      We will be at MLS Next Fest and I look forward to seeing you play. Ful...

SCHOOL: Tufts
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Medford, MA
  Admit Likelihood: Far Reach
  Coach: Kyle Dezotell — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Keep them updated
Not it Arizona
Responded generically pushing id camps
Sent MIT camp follow up email
Coach Dezotell did college talk on day 1 - Focused on winning mentality
  Next Action: Update RQ (Finn) — due 2026-04-27
  Contact Log (2 shown):
    [2026-04-03] Inbound via Sports Recruits — Eric Nordenson:
      Finn - Thank you for reaching out to our program and for your interest in
      Tufts Men’s Soccer! We have just wrapped up a *historic season*
      <https://gotuftsjumbos.com/sports/mens-soccer/schedule/2025>, winning our
      5th National Championship in program history, as well as winning the NESCAC
      Regular S...
    [2025-11-28] Inbound via Sports Recruits — Kyle Dezotell:
      Finn - Thank you for reaching out to our program and for your interest in
      Tufts Men’s Soccer! Our primary focus is on the current team and our
      upcoming matches. We have been to 11 consecutive NCAA Tournaments, winning
      4 National Championships in that run, and are working hard to continue this
      lon...

SCHOOL: Williams
  Status: Ongoing Conversation
  Division: D3 — NESCAC
  Location: Williamstown, MA
  Admit Likelihood: Far Reach
  Coach: Steffen Siebert — Head Coach <ss40@williams.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (1 shown):
    [2026-04-06] Inbound via Sports Recruits — Bill Schmid:
      Finn,
      
      Thanks for reaching out with your interest in Williams. It’s great to hear
      from you!
      
      We are in the thick of the 2027 recruiting process and would be happy to
      learn more about you! When you have some time, please fill out our Recruit
      Questionnaire <https://questionnaires.armssoftware.com/f...

---

## 11. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
| 2026-04-20 | Part 2 of email ingestion: SendGrid webhook + SR inbound parser (migrations 014, 015, 016) + school aliases + reparse script | Feature |
| 2026-04-19 | Part 1 of email ingestion: coaches table migration + backfill + app integration (migrations 012, 013) | Feature |
| 2026-04-19 | Phase 3c: Library landing, Assets/Questions restyle | Feature |
| 2026-04-19 | Phase 3b: School detail page at /schools/[id] with timeline, action bar, coach card | Feature |
| 2026-04-19 | Phase 3a: Schools list at /schools with filters, signals, 6-stage flow | Feature |
| 2026-04-19 | Phase 2: Today view replaces Dashboard as home page | Feature |
| 2026-04-19 | Phase 1: Liverpool design system + app shell | UI |
| 2026-04-19 | contact_log snooze/dismiss (migration 011) + Today Awaiting reply UI | Schema |
| 2026-04-17 | Prep for call feature — AI-generated school-specific question triage | Feature |
| 2026-04-17 | Question bank — 15 questions, 5 categories, add/edit/delete, nav tab | Feature |
| 2026-04-17 | school_question_overrides + school_specific_questions tables (migration 010) | Schema |
| 2026-04-16 | AI email drafting — /api/draft-email, DraftEmailModal, asset context layer | Feature |
| 2026-04-16 | Asset library — file upload, link management, versioning (migration 003) | Feature |
| 2026-04-16 | action_items table with drag-and-drop sort_order (migration 004-008) | Schema |
| 2026-04-15 | Initial app setup — schools, contact_log tables, Next.js + Supabase + Vercel | Setup |
| 2026-04-15 | Added `generate-claude-context.ts` script + `npm run export-context` | Tooling |

> **Change types:** Setup · Schema · Feature · UI · Tooling · Strategy · Coaching · Data

---

## 12. Key Coaching Contacts (verified April 2026 — confirm before emailing)

| School | Role | Name | Status |
|---|---|---|---|
| University of Rochester | HC | Ben Cross | 🔥 Hottest lead — praised film |
| MSOE | HC | Rob Harrington | Ongoing — connecting in May |
| Lafayette College | HC | Dennis Bohn | Ongoing conversation |
| Case Western Reserve | HC | Carter Poe | Responded on SR, sent schedule form |
| Cal Poly SLO | HC | Oige Kennedy | Invited to May 9-10 ID camp |
| Colorado School of Mines | HC | VACANT | Interim: Ben Fredrickson — hold all outreach |
| WPI | HC | Brian Kelley | Intro sent |
| RPI | HC | Adam Clinton | Intro sent |
| South Dakota Mines | HC | Teren Schuster | Replied April 15 — await Finn response |
| Bucknell | HC | Dave Brandt | Ongoing — 3-4-3 confirmed |
| Carnegie Mellon | HC | Brandon Bowman | Middling response — keep warm |
| Cornell | HC | John Smith | Intro sent |
| Dartmouth | HC | Connor Klekota | Hired Dec 2025 — intro sent |
| Emory | HC | Cory Greiner | Intro sent |
| Cal Poly Pomona | HC | Matt O'Sullivan | Intro sent |
| Washington University | HC | Andrew Bordelon | Intro sent |

---

## 13. "Copy for Claude" Export (strategy sessions in Claude.ai)

The app has (or will have) a "Copy for Claude" button that copies a formatted plaintext
pipeline summary to the clipboard for pasting into Claude.ai strategy sessions.

Format per school:
```
SCHOOL: [name]
  Status: [status]
  Division: [division] — [conference]
  Last Contact: [date]
  Head Coach: [name]
  Notes: [notes]
  Next Action: [action] ([owner]) — due [date]
```

---

*Context file last regenerated: see Section 10 header for date.*
*To update: `npm run export-context` from repo root.*
*Maintained by: Randy Almond | finnalmond08@gmail.com*
