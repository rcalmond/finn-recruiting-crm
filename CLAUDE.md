## Before shipping new features

1. Add a row to the Recent Changes table in 
   scripts/generate-claude-context.ts with:
   - Date (YYYY-MM-DD format)
   - Brief description of what shipped
   - Type (Feature, Schema, Bug fix, etc.)
2. Run `npm run export-context` to regenerate CLAUDE_CONTEXT.md
3. Commit the code changes AND the context regeneration together
4. `git push` — Vercel auto-deploys from main

Skip this checklist for: typo fixes, CSS tweaks, documentation 
updates, dependency bumps, anything not user-facing or 
architectural.

Reason: CLAUDE_CONTEXT.md is the source of truth for fresh 
Claude Code sessions. Stale context = wasted tokens + bugs. 
Missing a Recent Changes entry = future sessions won't know 
the feature exists.

---

## Deployment & Git Discipline

### Never run the Vercel CLI directly.

All production deploys go through git → auto-deploy from main.
Do not run `vercel`, `vercel --prod`, `vercel --prod --force`,
`vercel deploy`, or any other vercel CLI command. The canonical
deploy flow is:

1. Make changes
2. `git status` (review modified AND untracked)
3. `git add -A` (or selective adds after status review)
4. `git status` again (confirm staging matches intent)
5. `git commit -m "..."`
6. `git push`
7. Vercel auto-deploys from main

If a deploy needs Vercel-specific intervention (cache bust,
redeploy without rebuild, etc.), surface the symptom to the
user with what's needed — the user will run the Vercel command
themselves.

Reason: CLI deploys ship the local working tree regardless of
git state, while labeling the deploy with the local HEAD SHA
in the Vercel dashboard. This makes the "deployed: SHA" display
misleading because it can point to a commit that has nothing to
do with what was actually shipped. It also lets untracked files
reach production without being version-controlled. On
2026-06-04, this caused a week of feature work to sit silently
outside git for an entire multi-hour debugging session before
anyone noticed the gap. Git-only deploys eliminate this class
of failure entirely.

### `git status` is a required step in every commit flow.

Before every `git add`, run `git status` and read the output.
Pay specific attention to the "Untracked files" section. Any
untracked files must either be intentionally staged (via
`git add`) or explicitly excluded with a brief written
explanation of why (e.g., "scripts/test-render.ts is local-only
diagnostic, deliberately uncommitted").

After every `git commit`, run `git status` again to confirm
nothing was left behind. Expected output is "nothing to commit,
working tree clean" — or, if intentionally holding files back,
the explicit list of what's being held and why.

Do not report "committed and pushed" (or equivalent) without
having actually run `git status` to verify the working tree is
in the expected state. The status output is the proof; the
verbal claim alone is not sufficient.

Reason: On 2026-06-04, "committed and pushed" claims were being
made while significant untracked files (including the file being
actively edited) had been left out of the commit. The deployed
code didn't match what was believed to be deployed, which cost
hours of debug time chasing phantom fixes. `git status` is the
cheap verification step that closes the gap between intent and
reality.
