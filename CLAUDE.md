## Before shipping new features

1. Add a row to the Recent Changes table in 
   scripts/generate-claude-context.ts with:
   - Date (YYYY-MM-DD format)
   - Brief description of what shipped
   - Type (Feature, Schema, Bug fix, etc.)
2. Run `npm run export-context` to regenerate CLAUDE_CONTEXT.md
3. Commit the code changes AND the context regeneration together
4. Deploy via `vercel --prod` — auto-deploy via GitHub is 
   currently broken

Skip this checklist for: typo fixes, CSS tweaks, documentation 
updates, dependency bumps, anything not user-facing or 
architectural.

Reason: CLAUDE_CONTEXT.md is the source of truth for fresh 
Claude Code sessions. Stale context = wasted tokens + bugs. 
Missing a Recent Changes entry = future sessions won't know 
the feature exists.