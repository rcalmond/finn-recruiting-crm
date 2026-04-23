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

## 10. Live Pipeline — Generated April 23, 2026

**Active schools: 34** | Overdue actions: 27
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
  Contact Log (3 shown):
    [2026-04-03] Inbound via Sports Recruits — Brandon Bautista:
      Hi Finn,
      
      Thanks for reaching out!
      
      We will be hosting an ID camp on May 9-10 & August 1-2 that you can attend.
      It’ll be a great opportunity to get in front of our staff in a training and
      match environment as we continue to recruit for 2027. If you’re interested,
      you can register at the link belo...
    [2026-04-02] Outbound via Sports Recruits — Oige Kennedy; Zach Watson; Brandon Bautista:
      Coach Kennedy,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Cal Poly SLO's back-to-back Big West titles and the reputation of the engineering college — especially the aerospace and mechanical programs — make this one of the most compelling programs on my list.
      ...
    [2025-12-03] Outbound via Sports Recruits — Oige Kennedy; Zach Watson; Brandon Bautista:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Carter Poe; Fernando Lisboa:
      Coach Poe,
      
      Great connecting in Arizona — I wanted to follow up and confirm I've completed the schedule form you mentioned.
      
      A quick update: I'm currently playing left wingback for Albion SC Colorado MLS NEXT Academy U19, and that's the position I'm most excited about at the next level. The UAA's...
    [2025-12-03] Outbound via Sports Recruits — Carter Poe:
      Hi Coach,
      
       
      I completed the schedule form and the recruiting questionnaire. Let me know if you need anything else. Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn
    [2025-12-02] Inbound via Sports Recruits — Carter Poe:
      Finn, Thanks for reaching out. If you'd like to get on our schedule, please
      fill out the form below. https://forms.gle/V5d8u9oc3F8VYHGr8 Coach Poe

SCHOOL: CO School of Mines
  Status: Ongoing Conversation
  Division: D2 — RMAC
  Location: Golden, CO
  Admit Likelihood: Target
  Coach: Ben Fredrickson — Interim Assistant Coach <ben.fredrickson@mines.edu> [primary] ⚠ needs_review
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
  Contact Log (3 shown):
    [2026-02-20] Inbound via Email — Ben Fredrickson:
      Finn Almond,
      We hope this email finds you well.
      Thank you for joining us at our recent ID soccer camp on Feb 7th. We truly appreciate your time, energy, and effort you brought to the field. It was a pleasure getting to know you and watching you play.
      After careful consideration, we have decided t...
    [2026-01-07] Outbound via Sports Recruits — Greg Mulholland:
      Hi Coach,
      
       
      I hope everything is going well, I just wanted to let you know that I signed up for the ID camp in February.
      
       
      I've also attached both of my highlight videos below so you can see me a little bit more before the camp.
      
       
      Best,
      
      Finn Almond 
      
       
      Main Highlight Video
      
      MLS NEXT Highlight...
    [2025-12-29] Outbound via Sports Recruits — Greg Mulholland:
      Hi Coach,
      
      I wanted to follow up with you after MLS NEXT Fest.
      
      I’m a 2027 forward/winger with Albion SC Colorado MLS NEXT and played approximately 135 minutes across three matches at Fest. We went 1–2, including a 1–0 win and two competitive losses.
      
      I also made a MLS NEXT Fest specific highligh...

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
  Next Action: Wingback update email (Finn) — due 2026-04-23
  Contact Log (3 shown):
    [2026-04-08] Inbound via Sports Recruits — Gabriel Robinson:
      Finn,
      
      Thank you for the email reaching out and touching base with us. Please keep
      us updated on your schedule moving forward. Please also see the information
      below providing more insight into our college, program, and PPA ID camps.
      
      Summer ID camp information
      
      https://peakperformancesoccer.com/
      ...
    [2026-04-02] Outbound via Sports Recruits — Dennis Bohn; Gabriel Robinson; Ismar Tandir; Malik Wagner:
      Coach Bohn,
      
      Good to have spent time with your program in Florida and again in Arizona — I wanted to check in and share a few updates.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Lafayette's engineering programs and Patriot League soccer have stayed near the t...
    [2025-12-03] Outbound via Sports Recruits — Gabriel Robinson:
      Hi Coach,
      
       
      I just completed the recruiting questionnaire. Let me know if you need anything else. The camp looks interesting also. I'll work with my parents to see if I can make it.
      
       
      Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn

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
    [2026-04-02] Outbound via Sports Recruits — Rob Harrington:
      Coach Harrington,
      
      Thank you for your continued interest — I wanted to answer the question you asked about what I want to study.
      
      My focus is mechanical or aerospace engineering. MSOE's hands-on, project-based approach to engineering education is exactly the kind of environment I'm looking for — ...
    [2025-12-28] Outbound via Sports Recruits — Rob Harrington:
      Hi Coach,
      
      I wanted to follow up with you after MLS NEXT Fest.
      
      I’m a 2027 forward/winger with Albion SC Colorado MLS NEXT and played approximately 135 minutes across three matches at Fest. I really enjoyed the level of competition and the environment.
      
      Here's my highlight reel from MLS NEXT Fest...

SCHOOL: RPI
  Status: Intro Sent
  Division: D3 — Liberty League
  Location: Troy, NY
  Admit Likelihood: Reach
  Coach: Adam Clinton — Head Coach <clinta@rpi.edu> [primary]
  Last Contact: 2026-04-14
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Adam Clinton; Sean Maruscsak; Julian Boehning; Steve Wieczorek:
      Coach Clinton,
      
      I'm following up on my earlier message. I'm Finn Almond, a 2027 left wingback playing for Albion SC Colorado MLS NEXT Academy. RPI's engineering reputation is one of the strongest in the country, and the Liberty League's level of play is something I want to compete in.
      
      I play lef...
    [2025-12-03] Outbound via Sports Recruits — Adam Clinton; Sean Maruscsak; Julian Boehning; Steve Wieczorek:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...
    [2025-11-28] Outbound via Sports Recruits — Adam Clinton; Sean Maruscsak; Julian Boehning; Steve Wieczorek:
      Hi Coach,
      My name is Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. RPI is a program I’m excited about because of its strong engineering and applied science offerings and its high-level Liberty League soccer environment.
      
      This year I scored 29 goals with 14 assists, earning ...

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
  Next Action: Prep for call (Finn) — due 2026-04-21
  Contact Log (3 shown):
    [2026-04-22] Outbound via Sports Recruits — Sean Streb:
      Hi Coach,
      
      Thank you so much for your time today, I really enjoyed hearing more about the team and school. Sounds like wingbacks play a key role in your system, which is really intriguing for me.  
      
      I'll keep you updated on my upcoming games and whether we qualify for MLS NEXT Cup in Utah.
      
      Best,...
    [2026-04-20] Outbound via Sports Recruits — Ben Cross:
      Hi Coach,
      
       
      That works perfect! Im looking forward to it.
      
       
      Here's my phone number (720)-687-8982
      
       
      Best,
      
      Finn Almond
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
  Contact Log (2 shown):
    [2026-04-02] Outbound via Sports Recruits — Brian Kelley; Alex Wolfel; Gabe Ramos:
      Coach Kelley,
      
      I'm Finn Almond, a 2027 left wingback playing for Albion SC Colorado MLS NEXT Academy. WPI's project-based engineering curriculum and NEWMAC soccer make it a compelling combination — the idea of solving real engineering problems from day one is something I've been drawn to.
      
      I play...
    [2025-11-28] Outbound via Sports Recruits — Brian Kelley; Alex Wolfel; Gabe Ramos:
      Hi Coach,
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in WPI because of its strong project-based engineering programs and the competitive NEWMAC soccer environment.
      
      I wrapped up my HS season with 29 goals and 14 assists, earning 2nd Te...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Dave Brandt; Jeremy Payne; Mark Tun:
      Coach Brandt,
      
      Good to see you in Phoenix — I appreciated the conversation and wanted to follow up.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. The things your staff emphasized — high press, strong mental game — are central to how I play. I'm a defender who wa...
    [2025-12-03] Outbound via Sports Recruits — Dave Brandt:
      Hi Coach,
      
       
      I just completed the recruiting questionnaire. Let me know if you need anything else. Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn
    [2025-12-03] Inbound via Sports Recruits — Dave Brandt:
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
  Contact Log (2 shown):
    [2026-04-02] Outbound via Sports Recruits — Matt O'Sullivan; Jose Ortega; Andriy Budnyy:
      Coach O'Sullivan,
      
      I'm Finn Almond, a 2027 left wingback from Albion SC Colorado MLS NEXT Academy. Cal Poly Pomona's record in D2 — consistent NCAA tournament appearances and a program that develops players who go pro — is something I've been tracking for a while.
      
      I play left wingback at the MLS...
    [2025-11-28] Outbound via Sports Recruits — Matt O'Sullivan; Jose Ortega; Andriy Budnyy:
      Hi Coach,
      My name is Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. Cal Poly Pomona interests me because of its strong engineering programs and the highly competitive D2 soccer environment.
      
      This fall I scored 29 goals and 14 assists, earning 2nd Team All-State, and I’ve upl...

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
    [2026-04-08] Inbound via Email — Brandon Bowman:
      All,
      
      
      									After completing our sold out Spring ID clinic this past weekend, we are excited about our current player pool for the class of 2027 as we head into a couple of heavy recruiting months for club events.
      
      									Looking ahead, I'd like to extend an invitation to our two upcoming S...
    [2026-04-03] Inbound via Sports Recruits — Brandon Bowman:
      Thank you Finn.
    [2026-04-02] Outbound via Sports Recruits — Brandon Bowman; Spencer Wolfe:
      Coach Bowman,
      
      I wanted to check in following the ID camp in September and share an update on my season.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. CMU is a program and a university I have a lot of respect for — the UAA's academic culture is one of a kind, an...

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
  Contact Log (1 shown):
    [2025-11-27] Outbound via Sports Recruits — Luke Staats; John Smith; Tyler Keever:
      Hi Coach,
      My name is Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Cornell because of the strong engineering college, especially mechanical and aerospace pathways, and the way your team plays vertically and aggressively.
      
      I recently finish...

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
  Contact Log (2 shown):
    [2026-04-02] Outbound via Sports Recruits — Marlon McKenzie; Aziz Tahir:
      Coach McKenzie,
      
      I'm Finn Almond, a 2027 left wingback playing for Albion SC Colorado MLS NEXT Academy. Illinois Tech appeals to me for two reasons: the depth of the engineering programs and the chance to play competitive D3 soccer in Chicago.
      
      I play an attacking left wingback role — overlapping...
    [2025-11-28] Outbound via Sports Recruits — Marlon McKenzie; Aziz Tahir:
      Hi Coach,
      My name is Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Illinois Tech because of its strong engineering and computer science programs and the competitive environment in the Northern Athletics Conference.
      
      This season I had 29 goals and 14 a...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Dean Koski; Ryan Hess; Will Flannery:
      Coach Koski,
      
      Good to connect in Arizona — I wanted to follow up and stay on your radar heading into the spring.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Lehigh's Patriot League profile and engineering college are a great match for what I'm looking for, and...
    [2025-12-03] Outbound via Sports Recruits — Will Flannery:
      Hi Coach,
      
       
      I just completed the recruiting questionnaire. Let me know if you need anything else. Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn
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
    [2026-04-19] Outbound via Sports Recruits — Tim Peng:
      Coach Peng,
      
      The event went really well — thanks for asking. I'd definitely be interested in the May camp link when you have a chance.
      
      Since we last connected, I've put together a highlight reel that shows my transition to left wingback this season with Albion's U19s. The two-way game — overlapp...
    [2026-04-08] Inbound via Sports Recruits — Tim Peng:
      Hope that event went well!
      
      Want to come out to our camp in May? I can share the link if you need it
      
      Tim Peng Assistant Men’s Soccer Coach Middlebury College

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Jeremy Bonomo; Jordan Koduah; John Manga:
      Coach Bonomo,
      
      I'm following up on my earlier message and wanted to share a quick update. I'm Finn Almond, a 2027 left wingback playing for Albion SC Colorado MLS NEXT Academy out of Dawson School in Lafayette, CO.
      
      Northeastern's co-op engineering model is genuinely rare — the ability to combine...
    [2025-12-03] Outbound via Sports Recruits — Jeremy Bonomo; Jordan Koduah; John Manga:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...
    [2025-11-28] Outbound via Sports Recruits — Jeremy Bonomo; Jordan Koduah; John Manga:
      Hi Coach,
      I’m Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Northeastern because of the strong engineering programs and the player development model in the CAA, along with co-op opportunities that fit my academic goals.
      
      I recently finished my high sc...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Bill Garno; Yuri Lavrynenko; Kevin May; Travis Wood:
      Coach Garno,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. RIT's combination of a top engineering college and competitive Liberty League soccer is exactly the profile I'm looking for.
      
      I play an attacking wingback role on the left side — strong in 1v1 situations...
    [2025-12-03] Outbound via Sports Recruits — Bill Garno; Yuri Lavrynenko; Kevin May; Travis Wood:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...
    [2025-11-28] Outbound via Sports Recruits — Bill Garno; Yuri Lavrynenko; Kevin May; Travis Wood:
      Hi Coach,
      I’m Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in RIT because of the strong engineering and applied technology programs and the competitive soccer environment in the Liberty League.
      
      I recently wrapped up my HS season with 29 goals and 14 as...

SCHOOL: South Dakota Mines (South Dakota School of Mines & Technology)
  Status: Ongoing Conversation
  Division: D2 — Rocky Mountain Athletic Conference (RMAC)
  Location: Rapid City, SD
  Admit Likelihood: Likely
  Coach: Teren Schuster — Head Coach <Teren.Schuster@sdsmt.edu> [primary]
  Last Contact: 2026-04-15
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-04-21] Outbound via Sports Recruits — Teren Schuster:
      Hi Coach,
      
      It would be awesome to see you down here at one of my games. We have 4 games left in our regular season and if we win out, there's a good chance we'll go to MLS NEXT Cup in Utah in May.
      
      Here are my league games.  Let me know which you're looking to come to and I can get you all the de...
    [2026-04-20] Inbound via Sports Recruits — Teren Schuster:
      Hi Finn,
      
      Too bad, we are nearly finished with training, this is our last week. Send
      me your league schedule and I'll see if I can swing down and watch you play
      
      Teren Schuster, Head Men's Soccer Coach
      
      Hardrocker Men’s Soccer
      
      South Dakota Mines
      
      501 E. Saint Joseph St., Rapid City, SD 57701
      
      O:...
    [2026-04-19] Outbound via Sports Recruits — Teren Schuster:
      Coach Schuster,
      
      Thank you for the invite and for putting me on your radar. I filled out the recruiting questionnaire.
      
      Unfortunately I have a conflict with the July ID camp dates. Are there other opportunities to get in front of you and your staff this spring or summer — a showcase you'll be att...

SCHOOL: Stevens Institute of Technology
  Status: Intro Sent
  Division: D3 — MAC Freedom (Middle Atlantic Conference)
  Location: Hoboken, NJ
  Admit Likelihood: Reach
  Coach: Dale Jordan — Head Coach <djordan@stevens.edu> [primary]
  Last Contact: 2026-04-22
  RQ Status: Completed
  Videos Sent: Yes
  Contact Log (3 shown):
    [2026-04-22] Outbound via Sports Recruits — Dale Jordan:
      Hi Jordan,
      
      Thanks for the reply. Unfortunately we won't be in Dallas — Flex is Homegrown Division, and my club (Albion SC Colorado) is in the Academy Division, so our qualifier was in Scottsdale earlier this month. We went 2-2-0 and I scored an Olimpico directly off a corner.
      
      We're currently 2n...
    [2026-04-22] Inbound via Sports Recruits — Dale Jordan:
      Thanks for sharing
      
      Will you be playing in Dallas next week?
      
      Cheers
      
      Dale
    [2026-04-21] Outbound via Sports Recruits — Dale Jordan; Duncan Swanwick:
      Coach Jordan,
      
      I'm sending an updated highlight reel now that I've been playing left wingback full-time since November. I've transitioned from the striker role you may have seen earlier — now I'm playing a two-way wingback at Albion SC MLS NEXT Academy U19.
      
      Stevens continues to stand out for mec...

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
  Contact Log (3 shown):
    [2026-04-04] Inbound via Email — Andrew Bordelon:
      This is your chance to be evaluated in person, showcase your abilities, and see if WashU is the right fit for you! If you’re interested in competing at a high-academic, highly competitive program, we’d love to see you at camp.
      
      At camp, you will:
      
        *   Train and compete directly in front of the ...
    [2026-04-02] Inbound via Sports Recruits — Jack Mathis:
      Hello,
      
      Thank you so much for reaching out to Wash U Men's Soccer. I "Jack Mathis"
      have left the position as of 1/9/26 and will no longer be responding to
      emails for Wash U in St. Louis. Please reach out to Coach Bordelon for all
      questions regarding Wash U Men's Soccer. His email is bordelon@wust...
    [2026-04-02] Outbound via Sports Recruits:
      Coach Bordelon,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Wash U's position in the UAA — among the top academic D3 programs in the country — is something I've had on my radar for a while.
      
      I play an attacking left wingback role. My game is built around makin...

### Tier C — Exploratory (14 schools)

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
    [2026-04-02] Outbound via Sports Recruits — Justin Serpone; Rye Jaran:
      Coach Serpone,
      
      Congratulations on the 2024 national championship — that's a remarkable achievement and speaks to the standard you've built at Amherst.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Following the FL ID camp and our conversations in Arizona, I rem...

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
  Contact Log (3 shown):
    [2026-04-03] Inbound via Sports Recruits — Scott Wiercinski:
      Finn,
      
      Thank you for your interest in our Bowdoin Soccer program.  We are excited
      to learn more about you and watch you compete in the months
      ahead. Unfortunately, we are not able to attend your Scottsdale event due
      to commitments elsewhere.  We wish you the best of luck.
      
      We recently published o...
    [2026-04-02] Outbound via Sports Recruits — Scott Wiercinski:
      Coach Wiercinski,
      
      I wanted to follow up after connecting with your staff in Arizona — it was a good interaction and Bowdoin has stayed on my list.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. The NESCAC's combination of academic culture and competitive soccer ...
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

SCHOOL: Caltech
  Status: Ongoing Conversation
  Division: D3 — SCIAC
  Location: Pasadena, CA
  Admit Likelihood: Far Reach
  Coach: Duncan Gillis — Head Coach <dgillis@caltech.edu> [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Need a 1500 SAT to be competitive.
Need a 1500 SAT to be competitive (12/1/2025)
Got an email from Coach DeCoster saying that they're interested but that they need to beef up STEM academics and extracurricular.
  Next Action: Wingback update email (Finn)
  Contact Log (3 shown):
    [2025-12-03] Outbound via Sports Recruits — Rockne DeCoster:
      Hi Coach,
      
       
      Good to know about the target SAT number for Caltech.  I'm working to improve it and will let you know when I get there.
      
       
      Thanks,
      
      Finn
    [2025-12-01] Inbound via Sports Recruits — Rockne DeCoster:
      Hi Finn,
      
      Thanks for the update. Glad things are going well for you! To be
      transparent, you'd need a 1500+ on the SAT to be competitive for admission.
      If your score reaches that, please feel free to reach out again.
      
      All the best,
      
      *Rockne DeCoster*
      
      *Assistant Men's Soccer Coach* *-* *Caltech*
      
      ...
    [2025-11-28] Outbound via Sports Recruits — Rockne DeCoster:
      Hi Coach DeCoster,
      We've been in touch over email and I've now moved over to SportsRecruits.
      
      I’m Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I recently finished my HS season with 29 goals and 14 assists, earning 2nd Team All-State, and I’ve posted a new 3-minute highligh...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Samuel Matteson; Matthews Lima; Maitoe Suppasuesanguan; Nur Adhikarie:
      Coach Matteson,
      
      I wanted to follow up after the MIT ID camp this past July — it was a great experience and I came away with a lot of respect for the coaches involved in that event.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy out of Dawson School in Lafayette, ...
    [2025-12-03] Outbound via Sports Recruits — Samuel Matteson; Matthews Lima; Maitoe Suppasuesanguan; Nur Adhikarie:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...
    [2025-11-28] Outbound via Sports Recruits — Samuel Matteson; Matthews Lima; Maitoe Suppasuesanguan; Nur Adhikarie:
      Hi Coach,
      My name is Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I believe we met this summer at the late July ID camp at MIT.  I’m interested in Clark because of the strong STEM and applied science pathways, and the direction the soccer program is moving in the NEWMAC.
      
      ...

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
  Contact Log (3 shown):
    [2026-04-03] Inbound via Sports Recruits — Sean Elvert:
      Finn,
      
      Thanks for checking in with your continued interest in our program - if you
      could let us know the events you’ll be attending with your team or as an
      individual this spring/summer, that would be great.
      
       [image: Picture 1397805423, Picture]
      
      Sean Elvert
      
      *Head Men’s Soccer Coach  *
      
      *Colby ...
    [2026-04-02] Outbound via Sports Recruits — Sean Elvert; Ben Manoogian:
      Coach Elvert,
      
      Good to connect in Arizona — I wanted to follow up and mention something I appreciate about your background.
      
      Coming from Colorado College, you know the soccer environment here and the players coming out of it. I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT ...
    [2025-12-03] Outbound via Sports Recruits — Sean Elvert:
      Hi Coach,
      
       
      I just completed the recruiting questionnaire. Let me know if you need anything else. Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn

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
  Contact Log (3 shown):
    [2025-12-03] Outbound via Sports Recruits — Tim Stanton:
      Hi Coach,
      
       
      That's awesome! I also just completed the recruiting questionnaire. Let me know if you need anything else. Looking forward to seeing you in Phoenix!
      
       
      Thanks,
      
      Finn
    [2025-12-02] Inbound via Sports Recruits — Tim Stanton:
      Thank you for reaching out with your schedule and for your interest in
      Colgate Men's Soccer. We are looking forward to seeing you play in next few
      days. Good luck! – Coach Stanton
    [2025-11-28] Outbound via Sports Recruits — Erik Ronning; Ricky Brown; Tim Stanton:
      Hi Coach,
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Colgate because of the strong quantitative academics and the high-energy, disciplined style your team plays in the Patriot League.
      
      This fall I scored 29 goals with 14 assists, ea...

SCHOOL: Dartmouth
  Status: Intro Sent
  Division: D1 — Ivy League
  Location: Hanover, NH
  Admit Likelihood: Far Reach
  Coach: Connor Klekota — Head Coach <Connor.A.Klekota@dartmouth.edu> [primary]
  Last Contact: 2026-04-02
  Videos Sent: Yes
  Notes: Sent MIT camp follow up email, but no response
No interaction with Finn
Has Engineering program combined with AB program
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (2 shown):
    [2026-04-22] Outbound via Email — Connor Klekota:
      Hi Coach Klekota,
      
      I'm a 2027 left wingback at Albion SC Colorado MLS NEXT Academy U19 and
      wanted to reach out directly to get on your radar.
      
      I'm a 16-game starter at left wingback for our U19 Academy side where I
      have 2G/1A, including an Olimpico at MLS NEXT Cup Qualifiers in Scottsdale
      last we...
    [2025-11-28] Outbound via Sports Recruits — Bo Oshoniyi; Trevor Banks; Alexis Diaz; Alex Fetterly:
      Hi Coach,
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Dartmouth because of its strong engineering program at the Thayer School and the way the team plays in the Ivy League.
      
      I recently finished my HS season with 29 goals and 14 assis...

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
  Contact Log (3 shown):
    [2026-04-02] Outbound via Sports Recruits — Cory Greiner; Clayton Schmitt:
      Coach Greiner,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. The UAA's academic culture and Emory's consistent D3 soccer program are a strong combination. The 3-2 engineering partnership with Georgia Tech is also something I've been looking at as a path to the e...
    [2025-12-03] Outbound via Sports Recruits — Clayton Schmitt; Cory Greiner:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...
    [2025-11-28] Outbound via Sports Recruits — Clayton Schmitt; Cory Greiner:
      Hi Coach,
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Emory because of the engineering pathway through Emory + Georgia Tech and your program’s reputation for developing smart, technical attacking players. I also have family in the At...

SCHOOL: Johns Hopkins
  Status: Ongoing Conversation
  Division: D3 — Centennial Conference
  Location: Baltimore, MD
  Admit Likelihood: Far Reach
  Coach: Craig Appleby — Head Coach [primary]
  Last Contact: 2026-04-02
  RQ Status: Completed
  Videos Sent: Yes
  Notes: Asked us to keep them posted with soccer and academic updates!
Responded asking for transcript & test scores (Sent)
Coached your team on day 1 of MIT Camp
  Next Action: Wingback update email (Finn) — due 2026-04-26
  Also: Update RQ (Finn) — due 2026-04-27
  Contact Log (3 shown):
    [2025-12-03] Outbound via Sports Recruits — Craig Appleby:
      Hi Coach,
      
       
      I also just updated the recruiting questionnaire with my new team info and updated transcript and test scores. Hope to see you this week in Phoenix!
      
       
      Thanks,
      
      Finn
    [2025-11-28] Outbound via Sports Recruits — Craig Appleby:
      Hi Coach Appleby,
      
      We've been in touch over email from our work together at the MIT Camp in late July. I'm moving over to SportsRecruits for all of my soccer conversations. I wanted to update you on my high school season and invite you to see my games at MLS NEXT Fest next week.
      
      I wrapped up my ...
    [2025-08-09] Outbound via Email:
      Hi Coach Appleby,
      
      I've just completed the recruiting questionnaire, and I've signed up for
      the October SAT timeslot.
      
      Best,
      Finn Almond (#30 at MIT Camp)
      Striker/Winger
      Class of 2027
      Dawson School / Albion SC Boulder
      720.687.8982
      finnalmond08@gmail.com
      Highlight Reel <https://www.youtube.com/wat...

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
  Contact Log (3 shown):
    [2025-12-03] Outbound via Sports Recruits — Russell Payne:
      Hi Coach,
      
       
      I just completed the recruiting questionnaire. Let me know if you need anything else.
      
       
      I won't be able to make the 12/20 camp, and will look for camps in the new year.
      
       
      Thanks,
      
      Finn
    [2025-11-30] Inbound via Sports Recruits — Russell Payne:
      Hi Finn,
      
      Thank you for your interest in our university and soccer program!
      
      As a potential 2027 recruit with limited opportunities to watch you play, I
      think it would be a good idea to consider our upcoming Winter ID Camps.
      These camps give you the best chance to be exposed to the Northwestern
      c...
    [2025-11-28] Outbound via Sports Recruits — Russell Payne; Ronnie Bouemboue; JR DeRose; Flo Liu:
      Hi Coach,
      I’m Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. Northwestern interests me because of its strong engineering and applied sciences, and the highly competitive Big Ten soccer environment.
      
      This fall I scored 29 goals and 14 assists, earning 2nd Team All-State, and ...

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
  Contact Log (3 shown):
    [2025-11-28] Inbound via Sports Recruits — Steve Totten:
      Finn,
      
      Thanks for your email and interest in Princeton Soccer.  Hopefully we are
      able to watch more this year.  We just wrapped up a very successful season
      and we are doing our best to turn our attention towards recruiting, though
      it will take us some time to catch up on things.  We have had a bu...
    [2025-11-28] Outbound via Sports Recruits — Steve Totten:
      Hi Coach,
      
       
      Thank you for the response. I will keep you updated on how the tournament goes, club season, and how my academics progress throughout my junior year.
      
       
      Best,
      
      Finn Almond
    [2025-11-27] Outbound via Sports Recruits — Steve Totten; Jim Barlow; Sam Maira:
      Hi Coach,
      My name is Finn Almond, a 2027 striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in Princeton for its combination of top-tier engineering and a strong soccer program that develops attacking players well.
      
      I recently finished the high school season with 29 goals and 14...

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
  Contact Log (3 shown):
    [2025-11-30] Outbound via Sports Recruits — Drew Hutchins:
      Hi Coach,
      
      Thanks for the info about the ID camp. I'll talk with my folks to see what we can work out in the new year. I'm looking forward to seeing you all in Arizona. 
      
      Best, 
      
      Finn
    [2025-11-28] Inbound via Sports Recruits — Drew Hutchins:
      Hi Finn,
      
      Thank you for reaching out and expressing interest in our team. We're
      always excited to hear from dedicated student-athletes who are passionate
      about competing at the highest level on the field and in the classroom.
      
      We will be at MLS Next Fest and I look forward to seeing you play. Ful...
    [2025-11-28] Outbound via Sports Recruits — Drew Hutchins; Kevin McCarthy; Woo Jeon:
      Hi Coach,
      My name is Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. Stanford is a dream academic and athletic fit for me because of its elite engineering programs and one of the best player development environments in college soccer.
      
      I finished my high school se...

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
  Contact Log (3 shown):
    [2026-04-03] Inbound via Sports Recruits — Eric Nordenson:
      Finn - Thank you for reaching out to our program and for your interest in
      Tufts Men’s Soccer! We have just wrapped up a *historic season*
      <https://gotuftsjumbos.com/sports/mens-soccer/schedule/2025>, winning our
      5th National Championship in program history, as well as winning the NESCAC
      Regular S...
    [2026-04-02] Outbound via Sports Recruits — Kyle Dezotell:
      Coach Dezotell,
      
      It was great to hear you speak at the MIT camp last July — the perspective you shared on recruiting and what you look for in a player has stuck with me.
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Tufts is one of the schools I'm most intereste...
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
  Contact Log (3 shown):
    [2026-04-06] Inbound via Sports Recruits — Bill Schmid:
      Finn,
      
      Thanks for reaching out with your interest in Williams. It’s great to hear
      from you!
      
      We are in the thick of the 2027 recruiting process and would be happy to
      learn more about you! When you have some time, please fill out our Recruit
      Questionnaire <https://questionnaires.armssoftware.com/f...
    [2026-04-02] Outbound via Sports Recruits — Steffen Siebert; Bill Schmid:
      Coach Siebert,
      
      I'm Finn Almond, a 2027 left wingback with Albion SC Colorado MLS NEXT Academy. Williams is a program I've had on my list for a while — the NESCAC's academic culture and the level of D3 soccer in that conference are among the best in the country.
      
      I play left wingback in a back-th...
    [2025-12-03] Outbound via Sports Recruits — Steffen Siebert; Bill Schmid; Max Aken Tyers:
      Hi Coach,
      I wanted to follow up quickly in case my earlier email got buried.
      
      I’m Finn Almond, a 2027 left-footed striker/winger with Albion SC Colorado MLS NEXT. I’m very interested in your program and would love it if you could check out one of my games at MLS Next Fest.
      
      Here is my schedule in...

---

## 11. Recent Changes

> **How to use this section:** When you make a meaningful change — new feature, schema update,
> tech stack addition, recruiting strategy shift — add a one-line entry here with the date.
> Most recent at the top. This is the fastest way for Claude Code and Claude.ai to catch up
> on what's changed since they last saw the repo.

| Date | What changed | Type |
|---|---|---|
| 2026-04-23 | Part 5a: schools.domains[] infrastructure — migration 019, auto-learn script, parser Strategy 1b, reparse-orphan-domains.ts rescued 11 rows (Hopkins + Tufts) | Schema + Feature |
| 2026-04-22 | Part 4 extension: sent scan in autolabel captures Finn's direct outbound Gmail to known coaches | Feature |
| 2026-04-22 | Part 4 of email ingestion: Gmail API direct integration with OAuth, daily cron, /settings/gmail UI, parser rework | Feature |
| 2026-04-21 | Part 3a of email ingestion: live outbound CC capture via sendgrid webhook (HTML email preclean + reuse of sr-paste-parser) | Feature |
| 2026-04-21 | Part 3b of email ingestion: SR Sent bulk importer (migration 017, sr-paste-parser, /bulk-import page, content-hash dedup) | Feature |
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
