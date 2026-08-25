# Field-mask input reference: provenance record

**Status:** archive of owner's reference implementation, recorded 2026-08-24.

**Subject:** Field masking and validation reference implementation archived at `~/Archives/kitn-ui/field-mask-reference/`.

This document exists so the clean-room separation described in it can be checked by someone who was not here.

---

## What the archive contains

A complete reference implementation for field masking and text formatting patterns. The archive holds 24 files: component markup, styling, input handling logic, utility functions, and supporting UI elements demonstrating masking, formatting, validation, and accessibility patterns.

## The clean-room rule

Clean-room derivation turns the distinction between function and expression into a procedure. One team reads the reference work and writes a functional specification containing only unprotected material — facts, mathematics, ideas, procedures, processes. A second team, which never sees the reference implementation, implements from that specification alone. If the wall holds, the second team's output cannot be a copy of expression it never saw.

This archive is the reference implementation. Any derived implementation must follow this rule: the implementing team may study this reference to understand behavior, but must not copy code, transcribe structure, or allow any forbidden-string pattern to appear in the repo. Every implementation is written fresh from the behavior specification in docs/superpowers/specs/2026-08-24-form-field-formats-design.md.

**Policy clarification (2026-08-24):** This wording was corrected to match the policy of record. Task 1 studied this reference under this rule and disclosed it in its report.

## Verification

Standing grep to ensure no reference brand strings appear in derived work or documentation:

```
grep -rniFf ~/Archives/kitn-ui/field-mask-reference/forbidden-strings.txt docs/provenance/field-mask-reference.md
```

This must return 0 matches. The forbidden-strings file is located outside this repository (at the archive path) so the strings are never spelled inside it.

---

## Archive details

| Detail | Value |
| --- | --- |
| **Archive path** | `~/Archives/kitn-ui/field-mask-reference/` |
| **Created** | 2026-08-24 |
| **File count** | 24 |
| **Contents** | Utility components, styling, and the primary input implementation |
| **Verification** | SHA-256 checksums verified; all source and archive files match exactly |
