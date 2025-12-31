# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] – 2025-12-31 — Open Core Foundation

### Added
- Deterministic execution foundation with explicit execution modes.
- Stub execution mode enabling safe, side-effect-free runs.
- Strict, validated results model with per-test and per-step evidence.
- Deterministic artifact generation suitable for CI and long-term analysis.
- Cross-platform CLI support with explicit glob expansion for diff and flaky analysis.

### Changed
- Refactored execution architecture to center all orchestration in `CoreRunner`.
- Unified execution semantics across CLI, runner, and tools.
- Diff tooling upgraded to support multi-run, aggregate comparisons.
- CLI normalized input handling (paths, directories, globs) across commands.

### Fixed
- Eliminated platform-specific glob resolution issues (Windows / PowerShell).
- Removed legacy single-file assumptions from diff tooling.

### Notes
- This release establishes the **foundation layer only**.
- Execution semantics beyond stub mode are intentionally minimal.
- Visualization, dashboards, AI-assistance, and convenience features are out of scope.


## [v1.0.0] – 2025-12-31 — Open Core Foundation

### Overview
This release establishes the **Testergizer Open Core foundation**.
It intentionally prioritizes execution semantics, determinism, and result contracts over feature breadth or convenience.

### Changed
- Unified all test execution under a single orchestration layer (`CoreRunner`).
- Introduced explicit **execution modes** as a first-class concept:
  - `stub` (deterministic, non-interactive)
  - future-facing modes: `execute`, `baseline`
- Established an executor abstraction to decouple orchestration from step semantics.
- Defined a stable, schema-validated **RunResult model** capturing:
  - execution mode
  - test domain
  - timing
  - step-level outcomes
- Ensured deterministic, reproducible execution behavior in `stub` mode.

### Notes
- This release defines the **truth layer** of Testergizer: what ran, how it ran, and what it produced.
- Execution modes beyond `stub` are intentionally specified but not yet implemented.
- Artifact persistence, retries, screenshots, analytics, and AI-assisted capabilities are explicitly out of scope.
- CLI validation, diffing, and flaky analysis behavior remain unchanged.

### Positioning
- **Open Core** focuses on correctness, determinism, and transparent contracts.
- Higher-level convenience, productivity features, and analytics are reserved for **Testergizer Pro**.


## [Unreleased] – 2025-12-23 — Pre-Foundation Architecture Work

### Changed
- Refactored execution architecture to unify all test execution under `CoreRunner`.
- CLI `run` command now delegates execution exclusively to `CoreRunner`; legacy step execution logic is no longer used.
- Introduced execution modes (`stub`, future-facing `execute`, `baseline`) with deterministic `stub` as the initial implementation.
- Established executor abstraction to decouple step semantics from orchestration.
- Defined a stable, schema-validated `RunResult` contract capturing execution mode, test domain, timing, and step outcomes.

### Notes
- This release establishes the **Open Core execution and results foundation**.
- Execution semantics beyond deterministic `stub` are intentionally deferred.
- Artifact persistence, retries, screenshots, and analytics are not yet implemented.
- Schema validation (`validate`), diffing, and flaky analysis behavior remain unchanged.


