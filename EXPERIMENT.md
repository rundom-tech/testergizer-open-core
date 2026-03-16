# Experimental Branch Notice

This branch exists for **execution-validated experimentation only**.

Nothing here is frozen.
Nothing here is promised.
Everything here is allowed to change or disappear.

---

## Purpose

Validate — through **real execution, artifacts, and human-readable reports** — a coherent vertical slice of Testergizer concepts, end-to-end.

This branch is not about correctness-by-design.
It is about **truth-by-execution**.

---

## Experimental Scope (Vertical Slice)

### 1. Central Locators Repository (CLR)
- Ordered / ranked selector candidates
- Context-scoped locator validity (“subscription”)
- Deterministic resolution under ambiguity
- Explicit evidence of *which* locator and *why*

### 2. Reusable Executables
- JSON-defined reusable flows (e.g. `login`, `logout`)
- Included via `include`, not copied
- No inline selectors — CLR keys only
- Execution provenance preserved (who introduced what)

### 3. Suite Composition
- Suites/tests composed from reusable executables
- Explicit context activation during execution
- No hidden global state
- Observable resolution behavior

### 4. Execution Semantics
- Clear separation between:
  - **executionMode** (runtime behavior)
  - **executionIntent** (why the run exists)
  - **validationMode** (debug vs prod semantics)
- Intent is recorded, not inferred
- Semantics are visible in artifacts and reports

### 5. Evidence & Reporting
Execution produces:
- Machine-readable artifacts
- A human-readable HTML report that *proves*:
  - context transitions
  - locator resolution decisions
  - selector candidate choice
  - executable / include provenance
  - execution intent and validation mode

The report UI itself is part of the experiment:
- Layout split (structure vs theme tokens)
- Minimal appearance controls (View → Appearance)
- Inline JS only (portable, filesystem-safe)
- No persistence assumptions

---

## Non-Goals (Explicit)

- ❌ No schema freeze
- ❌ No API stability guarantees
- ❌ No Studio / Recorder assumptions
- ❌ No UX polish promises
- ❌ No backward compatibility commitments
- ❌ No performance optimization effort

If something feels “rough but works” — that is acceptable here.

---

## Rules of Engagement

- Decisions are made **only after reviewing real execution artifacts**
- No conceptual debates without evidence
- Anything in this branch may be:
  - rewritten
  - redesigned
  - split
  - or deleted entirely
- Commits may span multiple layers **if they represent one executed idea**

This branch optimizes for **learning speed**, not cleanliness.

---

## Branch

`experiment/clr-context-resolution`

If you are looking for supported, documented, or stable behavior —  
**this is not the branch you want**.

Use `main`.
