# Contributing to Testergizer Open Core

Thank you for your interest in contributing to Testergizer Open Core.

This project follows an open-core model and prioritizes **stability, determinism, and strict contracts**. Contributions are welcome, provided they align with these principles.

---

## How to contribute

### Reporting issues
- Use GitHub Issues to report bugs or unexpected behavior
- Include:
  - Testergizer version
  - CLI command used
  - Relevant JSON (suite or results), if applicable
  - Expected vs actual behavior

---

### Proposing changes
- Fork the repository
- Create a focused branch
- Submit a Pull Request with:
  - A clear description of the change
  - Rationale for why it belongs in Open Core
  - Confirmation that no public contracts are broken

---

## What is appropriate for Open Core

Contributions that are generally welcome:
- Bug fixes
- Documentation improvements
- Performance optimizations
- Internal refactoring with no contract changes
- CLI robustness and error handling improvements
- Test coverage improvements

---

## What is out of scope for Open Core

The following will **not** be accepted into Open Core:

- UI dashboards or visual tooling
- Test recorders
- AI-based healing or selector repair
- Cloud or distributed execution
- Team, role, or governance features
- Breaking changes to schemas or CLI contracts

These capabilities are intentionally reserved for Testergizer Pro.

---

## Stability guarantees

The following are considered **stable contracts** in the v0.1.x line:
- CLI commands and flags
- Test suite JSON schema (v1)
- Results JSON schema (v1)
- Artifact structure and semantics

Pull requests that alter these contracts will be rejected or deferred to a future major version.

---

## Governance

Testergizer Open Core is maintained by the project maintainer(s).

All contributions are reviewed.  
Changes to licensing, schemas, CLI contracts, scope, or governance require explicit maintainer approval.

---

## Code style and quality
- Keep changes minimal and focused
- Avoid introducing new dependencies unless strictly necessary
- Ensure all tests and validation pass before submitting a PR

---

Thank you for helping improve Testergizer Open Core.
