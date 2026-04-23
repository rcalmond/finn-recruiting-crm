alter table public.schools
  add column if not exists coach_page_scrape_enabled boolean not null default true;

comment on column public.schools.coach_page_scrape_enabled is
  'When false, scraper skips this school. Used for SPA/JS-rendered coach pages that static fetch cannot parse. URL is preserved for human reference.';
