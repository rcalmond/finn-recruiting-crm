-- Migration 050: Add source column to call_prep_docs
-- Distinguishes generated (from agentic research flow) vs uploaded (manual).

alter table call_prep_docs
  add column source text not null default 'generated'
    check (source in ('generated', 'uploaded'));
