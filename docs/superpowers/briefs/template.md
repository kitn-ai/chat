# Brief template

Single source of truth for the prohibitions and report shapes handed to any
role in an orchestration session. `scripts/brief.mjs` reads THIS file at run
time — never inline its text elsewhere — and stamps the constraints section
into every generated brief, implementer and reviewer alike.

WHY THIS FILE EXISTS: the standing prohibitions were being retyped into every
implementer brief and were absent from every reviewer brief. A re-reviewer
then ran `git checkout` into a live working tree to verify a red/green,
because nothing had told them not to. The fix is one file the prohibitions
live in, stamped into both roles mechanically instead of retyped by hand.

## Standing constraints (all roles)

- No `git checkout` / `git reset` / `git stash` — ever. Restore by file copy if needed.
- Never rebuild the package (`nx build ui`) unless the brief explicitly says so.
- No subagents.
- Watch every new check FAIL before trusting it (plant the defect, see the red for the right reason, then the green).
- Never run `nx test` — the NX cache has returned wrong verdicts in both directions.
- Edit only the files this brief assigns. If the work needs another file, stop and report.
- Commits are the supervisor's; never touch the git index.
- Look it up before you assert it: no claim about the tree goes in a report unread. (Not mechanizable — stated so it is not mistaken for covered.)

## Implementer brief

TASK: {{TASK}}

FILES: {{FILES}}

CO-WRITERS: {{CO_WRITERS}}

VERIFY: {{VERIFY}}

Report back exactly:

```
DONE:
FILES:
VERIFY:
SELF-CHECK:
GAPS:
NEEDS-REGEN:
BLOCKERS:
```

## Reviewer brief

CHANGE: {{CHANGE}}

ACCEPTANCE: {{ACCEPTANCE}}

HOW TO RUN: {{HOW_TO_RUN}}

Reviewer rules:

- Never PASS from reading a diff.
- Reproduce RED before confirming GREEN for a reported bug.
- Verify the real composition, not a proxy.
- Write your OWN adversarial probes.
- Never edit code.

Report back exactly:

```
VERDICT: PASS|FAIL|BLOCKED
EVIDENCE:
CHECKED:
IF FAIL:
```
