// Conflict-marker fence — runs in prebuild, FAILS the build (exit 1) if any
// tracked file contains an unresolved merge conflict marker.
//
// WHY THIS EXISTS. During an E2 push split, a rebase conflict was "resolved" by
// a script whose regex required content on the HEAD side. This conflict had an
// EMPTY HEAD side, so the regex silently did not match — and `git rebase
// --continue` proceeded anyway, because the files had been `git add`ed. The
// commit landed with `<<<<<<<` markers inside CLAUDE_CONTEXT.md and the context
// generator. Nothing reported a problem: the resolve script printed its own
// failure into a traceback that scrolled past, and git reported a successful
// rebase.
//
// It is the week's motif one more time — THE TOOL REPORTED PROGRESS AND HAD DONE
// NOTHING — and it was caught by grepping the files for markers before pushing.
// That grep is the output check, so it lives here rather than in anyone's habit.
//
// SCOPE, stated because a guard's exclusions are part of its claim:
//   - only `<<<<<<<` and `>>>>>>>` are searched. `=======` is NOT, because it is
//     also a Markdown h1 underline and would fire on ordinary prose.
//   - only files git is tracking; untracked scratch files are not our problem.
//   - binary files are skipped by git grep itself.
import { execFileSync } from 'node:child_process'

// Built by concatenation so this file does not match its own search.
const OPEN = '<'.repeat(7)
const CLOSE = '>'.repeat(7)

let hits = ''
try {
  hits = execFileSync(
    'git',
    ['grep', '-n', '-I', '-E', `^(${OPEN}|${CLOSE}) `, '--', '.'],
    { encoding: 'utf8' },
  )
} catch (err) {
  // git grep exits 1 when it finds NOTHING — that is the success case.
  if (err.status === 1) {
    console.log('✓ conflict markers: none in tracked files')
    process.exit(0)
  }
  console.log(`… conflict markers: skipped (${err.message.split('\n')[0]})`)
  process.exit(0)
}

const lines = hits.trim().split('\n').filter(Boolean)
console.error('✗ CONFLICT MARKERS in tracked files — an unresolved merge was committed:')
for (const l of lines) console.error('  - ' + l.slice(0, 160))
console.error('Resolve the conflict properly, then re-run. Do not push this.')
process.exit(1)
