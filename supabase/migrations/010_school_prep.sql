-- School-aware prep: overrides on global questions per school
create table public.school_question_overrides (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  status text not null check (status in ('answered', 'priority', 'skip')),
  context_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, question_id)
);

alter table public.school_question_overrides enable row level security;

create policy "Authenticated users full access" on public.school_question_overrides
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.school_question_overrides;

-- School-aware prep: school-specific questions (not in global bank)
create table public.school_specific_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  question_text text not null,
  rationale text,
  category text not null check (category in (
    'Formation & Fit',
    'Roster & Playing Time',
    'Development',
    'Culture',
    'Academics & Aid'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_specific_questions enable row level security;

create policy "Authenticated users full access" on public.school_specific_questions
  for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.school_specific_questions;
