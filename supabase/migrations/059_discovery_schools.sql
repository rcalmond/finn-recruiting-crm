-- Migration 059: discovery_schools — the School Discovery universe
-- Static reference dataset of US colleges with men's soccer programs.
-- Facet-browsable (division/region/academic/enrollment/engineering) and the
-- name-match anchor for the LLM "find more like these" layer.
-- Reference data: no updated_at trigger, no realtime publication.

create table discovery_schools (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  short_name       text,
  division         text not null,   -- 'D1' | 'D2' | 'D3' | 'NAIA' | 'JUCO'
  conference       text,
  state            text not null,   -- two-letter USPS code
  region           text not null,   -- 'Northeast' | 'Mid-Atlantic' | 'Southeast'
                                     -- | 'Midwest' | 'Southwest' | 'West'
                                     -- Convention: Northeast = New England + NY;
                                     -- Mid-Atlantic = NJ/PA/MD/DE/DC/VA/WV
  enrollment_band  text,            -- 'under_2k' | '2k_5k' | '5k_15k' | 'over_15k'
  academic_band    text,            -- 'most_selective' | 'highly_selective'
                                     -- | 'selective' | 'accessible'
  has_engineering  boolean not null default false,
  city             text,
  note             text,
  created_at       timestamptz not null default now()
);

-- Primary browse path is division + region facets.
create index discovery_schools_division_region_idx
  on discovery_schools (division, region);

-- Name is the cross-check key for LLM proposals and add-to-list dedup.
create index discovery_schools_name_idx on discovery_schools (name);

-- RLS: authenticated users full access (house idiom)
alter table discovery_schools enable row level security;

create policy "auth users full access on discovery_schools"
  on discovery_schools for all to authenticated
  using (true) with check (true);
