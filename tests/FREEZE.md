# Platform Freeze — Executable v1 & CI Governance

Status: **FROZEN**  
Type: **Unplanned Sprint**  
Date: 2026-01-29

---

## Scope of This Freeze

This freeze locks the current state of the following platform concerns:

- Executable v1 contract and JSON schema
- CLI execution pipeline (`runSuiteFromFile`, input resolution, validation)
- Reusable flows and include expansion rules
- Reporter placement and artifact generation
- Platform-level tests (executable / contract tests)
- CI governance, including:
  - platform test enforcement
  - non-gating coverage and Codecov upload
  - nightly OS × Node matrix
  - deduplicated nightly failure issues
  - deterministic root-cause labeling (node-version only)

All items above are considered **intentionally complete**.

---

## Intentional Constraints

The following constraints are explicit and must not be violated:

- Executable v1 is a **closed contract**
- Reusable flows are **linear and non-composable**
- Validation rules are **strict and fail-fast**
- Platform tests defend **contracts**, not examples
- Coverage is **diagnostic only**, never a quality gate
- CI logic must remain **deterministic**
- Root-cause labeling must be **rule-based**, not inferred
- No “small” or “obvious” extensions inside this scope

---

## Reopening Rules

This freeze may be reopened **only** if:

- A new Sprint is explicitly declared, or
- A concrete failure mode is observed that cannot be handled within the frozen design

Any reopening must document:
- what broke
- why the freeze is insufficient
- the intended exit condition

---

## Rationale

This work emerged as an unplanned Sprint triggered by the need to:

- formalize the Executable v1 model
- close gaps between definition, execution, and validation
- introduce platform-level tests and CI governance
- prevent accidental or heuristic-driven evolution

The resulting design is now coherent, sufficient, and bounded.

---

## Final Note

This freeze exists to prevent **accidental continuation**.

If you are reading this file:
> Assume the current design is intentional.  
> Do not extend it casually.
