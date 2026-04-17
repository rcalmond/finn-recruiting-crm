-- Question bank
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  rationale text,
  is_custom boolean not null default false,
  sort_order integer,
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

create policy "Authenticated users full access" on public.questions
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.questions;

-- Seed: Formation & Fit
insert into public.questions (category, question, rationale, is_custom, sort_order) values
(
  'Formation & Fit',
  'What formation do you typically play, and how do you use your wide players?',
  'Wingbacks only exist in a back-three system (3-4-3, 3-5-2, etc.). If a coach runs a 4-back system, the position doesn''t exist on their roster — Finn would be playing fullback or winger. Confirm this before anything else.',
  false, 1
),
(
  'Formation & Fit',
  'In your system, what do you ask of your wingbacks in the defensive phase?',
  'Some coaches want wingbacks deep and conservative. Others want them bombing forward constantly. This tells Finn how much of his attacking instincts he''d get to use, and whether their expectations match how Albion has built him.',
  false, 2
),
(
  'Formation & Fit',
  'How do your wingbacks typically combine with your central midfielders and strikers in the final third?',
  'Reveals whether they''ve actually thought about the position tactically — and whether there''s a real creative role available. A vague answer may signal wingbacks aren''t a featured part of their system.',
  false, 3
),

-- Seed: Roster & Playing Time
(
  'Roster & Playing Time',
  'Are you actively recruiting left wingbacks for the 2027 class, and how many spots do you expect to have?',
  'The most direct question Finn can ask. Coaches respect players who don''t waste their time. This tells him immediately whether a spot exists — or whether he''d be competing for depth at a position they''ve already filled.',
  false, 4
),
(
  'Roster & Playing Time',
  'Who are your current left wingbacks, and what years are they?',
  'Two strong wingbacks who are sophomores and juniors means sitting for two years. One departing senior means a real starting competition day one. Roster research before and after this conversation is essential.',
  false, 5
),
(
  'Roster & Playing Time',
  'How do you typically use freshmen — compete for starting spots right away, or develop behind upperclassmen first?',
  'Gives a realistic picture of Finn''s trajectory. Some programs genuinely play freshmen who earn it. Others have a culture of waiting your turn. Neither is automatically bad — but Finn needs to know which culture he''s walking into.',
  false, 6
),

-- Seed: Development
(
  'Development',
  'How do you develop players technically — what does a typical training week look like?',
  'Tells Finn how much coaching investment he''d actually get. A coach who gives specific detail (position-specific work, individual technical sessions, video review) is running a more serious development environment than one who just describes scrimmages.',
  false, 7
),
(
  'Development',
  'You saw my highlight film — where do you think I need to grow most to compete at your level?',
  'Two things happen here: Finn gets honest feedback about how they actually evaluated him, and learns whether their developmental feedback aligns with what he''s working on. A coach who gives specific, accurate feedback has actually watched the film carefully.',
  false, 8
),
(
  'Development',
  'Do players work with position-specific coaches, or does the head coach work with the whole group?',
  'Relevant especially at D3 programs with smaller staffs. If there''s one coach running everything, Finn may get less individual attention. Some programs have strong assistants who own wide player development — that''s a big plus.',
  false, 9
),

-- Seed: Culture
(
  'Culture',
  'How would you describe the culture in the locker room — what kind of player thrives here, and what kind doesn''t?',
  'Open-ended enough that coaches will tell you something real. What they emphasize (brotherhood, competition, accountability, fun) tells you about the environment. Listen for what they DON''T say as much as what they do. Red flag: vague answers about "great guys."',
  false, 10
),
(
  'Culture',
  'What''s your relationship like with players during the season? Are you accessible outside of practice?',
  'Tells Finn the coaching style — do players feel comfortable having hard conversations with this coach? Do players develop relationships with the staff that last beyond soccer? This matters for four years, not just the first season.',
  false, 11
),
(
  'Culture',
  'How do you handle a player who''s competing hard but not yet in the starting lineup?',
  'Reveals how the coach manages egos, development, and rotation. A good answer shows a real communication system. A bad answer reveals they don''t think much about the guys who aren''t already starting. Finn wants to know he''ll be invested in even if he''s #2 at his position early.',
  false, 12
),

-- Seed: Academics & Aid
(
  'Academics & Aid',
  'For players like me — strong academics, MLS NEXT club background — what does a typical financial aid or scholarship offer look like at your program?',
  'D3 schools can''t offer athletic scholarships, but many have significant merit and need-based aid that effectively closes the gap. D1/D2 schools can offer athletic money. This conversation needs to happen early — before Finn is emotionally invested in a school he can''t afford.',
  false, 13
),
(
  'Academics & Aid',
  'What engineering programs does your school offer, and do student-athletes in those programs typically handle the workload well?',
  'Confirms the academic program exists and is viable for an athlete. A coach who can name engineers currently on the roster is credible. A coach who says "our guys do great" with no specifics may not know his own roster.',
  false, 14
),
(
  'Academics & Aid',
  'What''s your graduation rate for soccer players, and do many go on to work in engineering fields?',
  'Signals Finn is serious about the long-term outcome, not just soccer. Also gives real data to compare programs. MSOE''s coach answered this unprompted with specific numbers — that''s a green flag. A coach who doesn''t know the answer is telling you something.',
  false, 15
);
