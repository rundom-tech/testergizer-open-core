# Changelog

All notable changes to this project will be documented in this file.

## [SPRINT 7] - Precompiled Divergent Topology - 2026-03-11

### Added
- **Precompiled Divergent Topology**: Finalized the Base and Extension pattern within the orchestration layer to support strict deterministic branching.
- **Divergence Proof Suite**: Added a complete `v2-variance-and-divergence` example directory demonstrating the injection of structural step extensions directly from a data matrix.

### Changed
- **Data Matrix Resolution**: Upgraded `DataMatrixResolver` to natively support the extraction of custom `steps` arrays from matrix rows, enabling structural divergence without imperative logic.
- **Identifier Normalization**: Standardized matrix row identification to seamlessly accept both `id` and `variationId` for deterministic testlet naming.
- **Source Type Inference**: The compiler now automatically infers the data matrix source type (JSON or CSV) based on the file extension.
- **Suite Orchestration**: Refactored `SuiteCoordinator` to securely fuse base test steps with variant extension steps prior to test execution.


## [SPRINT 7] - Data Variance and Precompiled Branching - 2026-03-10

### Added
- **Data Matrix Resolver**: Core logic for unrolling data variance matrices into independent testlets.
- **Precompiled Branching**: Support for additive structural variance where matrix entries can append custom steps to a base flow.
- **Playwright assertUrl**: Native support for declarative URL boundary assertions using Playwright polling.
- **Concurrency Tracking**: Explicit logging and reporting of worker counts in `run.json` and `report.html`.

### Changed
- **Strict Boundary Resolution**: Transformed locator resolution into a pure synchronous data extractor.
- **Neutered Probes**: Removed zero-latency DOM probing to eliminate React hydration race conditions.
- **Flexible Target Parsing**: Updated `target.ts` to support both 2-part global and 3-part contextual keys.
- **Silent API Boot**: Patched `ApiRepository` to silence readiness logs when zero endpoints are loaded.

### Fixed
- Fixed race conditions where Playwright auto-wait was defeated by framework-level DOM queries.
- Fixed missing `matrix-expect` step reporting in HTML artifacts.


## [SPRINT 6] - Full Stack Intelligence Matrix - 2026-03-10

### Added
* Introduced the 31-Bit Domain Flag system (`TestDomainFlag` in `enums.ts`) to route execution across UI, API, FS, DB, and EMAIL layers in a single thread.
* Added `DbExecutor` and `EmailExecutor` as Open Core stubs to intercept backend interactions and generate physical audit trails.
* Implemented schema-compliant component composition using the `include` directive to flatten reusable execution contracts at runtime.
* Added the `examples/v2-fullstack/` directory, containing the comprehensive 31-bit matrix proof, context variables, and context-aware CTR locators.
* Added the `examples/v2-hybrid/` directory to support mixed-engine execution models.

### Changed
* Upgraded `TestExecutor` to properly resolve context-aware logical locators (e.g., extracting the `login` context from `login.button.submit`) and map them to cascading physical selectors.
* Refactored `SuiteCoordinator` to securely pass target definitions and inherited variable contexts down to the execution thread.
* Expanded `resultTypes.ts` to support detailed `audit` log arrays injected by Open Core execution stubs.
* Updated `htmlReporter` and layout CSS to cleanly render the new domain targets and audit trails in the visual execution report.

### Removed
* Removed legacy flat flow structures (`flows/auth/login.json` and `logout.json`) to enforce the new reusable component architecture.


## [API STATE EXTRACTION - SPRINT 4 & 5] - State Capture & Chaining Output to Input - 2026-03-06

### Added
- **API State Extraction:** Introduced a zero-dependency JSONPath resolver (`ApiExecutor.ts`) capable of extracting scalar values (strings, numbers, booleans) from deeply nested API response payloads.
- **Output-to-Input Chaining:** Integrated the `VarianceResolver` into the API execution loop. The engine can now capture a value in Step A and dynamically inject it into the URLs, headers, payloads, and expected assertions of Step B.
- **Wildcard Array Validation:** Upgraded `GovernanceValidator` to support recursive `[*]` array mapping. The engine can now automatically validate every item within a returned JSON array against a dynamically captured state variable.
- **Report Visibility:** Enhanced `htmlReporter.ts` to automatically detect and render extracted context variables into a dedicated "🔗 captured state" UI table within the HTML run report.


## [API & UI DATA VARIANCE SPRINT 4] - 2026-03-05 (State Capture & Chaining Output to Input)

### Added
- **State Capture (Sprint 4):** Steps can now define an `extract` array to capture data mid-execution and store it as variables for subsequent steps.
- **API Extraction:** `ApiExecutor` supports extracting values from JSON responses using JSONPath.
- **UI Extraction:** `TestExecutor` supports extracting DOM properties (e.g., `innerText`) and attributes (e.g., `data-id`) via Playwright.
- **Type Casting:** Captured variables can be strictly cast as `string`, `number`, or `boolean` using the `transform` property in the extraction instruction.
- **System Macro Protection:** `ExecutionContext` now throws a protection violation if a step attempts to overwrite system macros like `{{$guid}}` or `{{$timestamp}}`.
- **Unit Testing:** Added `vitest` dependency and test coverage for the `VarianceResolver`.

### Fixed
- **Type Coercion in Resolver:** `VarianceResolver` now preserves original data types (boolean, number) when a payload uses an exact match variable (e.g., `{{isActive}}`), rather than coercing everything to a string.


## [API SPRINT 3] - 2026-03-04 (Data Variance)

### Added
- **Variance Engine**: Introduced `ExecutionContext` and `VarianceResolver` in `src/core/context/`.
- **System Macros**: Added support for dynamic tokens like `{{$guid}}`, `{{$timestamp}}`, and `{{$isoDate}}`.
- **Diagnostic Logging**: Added resolved header logging to `ApiExecutor` for transparency.

### Fixed
- **Pre-processor Routing**: Updated `TestExecutor` to resolve logical targets (e.g., `{{userId}}`) before repository lookups, fixing UI resolution failures.
- **Deep Resolution**: Enabled recursive placeholder swapping in nested JSON payloads and API headers.


## [API Sprint 2] - 2026-03-04

### Added: The Assertion Engine (API Sprint 2)
Decoupled Assertion Logic: Integrated the ApiExecutor as a standalone "Judge" that evaluates live HTTP responses against defined expectation blocks.

Structured Assertions: Updated the ApiExecutable interface to support an array of ApiAssertion objects, allowing multiple checks per request.

Native status_code Validation: Explicitly checks HTTP response codes (e.g., 200, 404, 201) and flags mismatches as failures.

JSONPath Evaluation: Implemented a lightweight dot-notation parser to validate specific fields within deep JSON payloads (e.g., $.name, $.email).

Execution Timing: Added sub-millisecond precision tracking using performance.now() to monitor API latency.

### Fixed/Changed
TestExecutor Routing: Refined the api-call action in TestExecutor.ts to map assertion failures directly into the main StepResult errors array, enabling native rendering in HTML reports.

Artifact Isolation: Confirmed all REST domain results route strictly to the rest-api project ID, bypassing UI/Browser overhead.

## [Unreleased] - 2026-03-03

### Added
- **Universal CTR Governance**: API test suites are now fully governed by the same version-control mechanics as Web UI tests.
- **CLI AUT Version Injection**: Added support for the `--autVersion` flag (e.g., `--autVersion="1.5.0"`) to allow CI/CD pipelines to inject live API deployment versions for strict semantic version compatibility checks.
- **API Assertion Schema**: Added the `expected` assertion block to the core JSON step schema to support upcoming HTTP response validation.

### Changed
- **Domain-Aware Reporting**: The HTML Report's "CTR governance" card now dynamically adapts its display based on the active test domain (showing DOM status for Web, and loaded endpoints for REST).
- **Artifact Routing**: API test runs now output to a dedicated `rest-api` folder instead of defaulting to `chromium`.

### Fixed
- **Phantom Browser Launches**: Fixed an issue where the native-fetch API engine was unintentionally booting up a headless Playwright instance and provisioning empty UI artifact directories.

## [2026-03-02] - API SPRINT 1: Live Execution & Domain Isolation
### Added
API Execution Engine: Formally introduced the api engine as a first-class execution axis alongside testergizer and playwright.

Domain Isolation (REST): Implemented ApiTargetRegistry (isolated from LocatorRepository) to handle REST endpoints without leaking UI/Web logic.

CLI Support: Updated index.ts (Yargs) and run.ts to support the --engine api flag.

Orchestration Bridge: Enhanced SuiteCoordinator.ts to inject the ctrDefinition (targets) into the TestExecutor constructor.

### Changed
Deprecation: Formally renamed the internal CoreRunner references to TestExecutor and updated TestExecutorOptions to reflect the current architecture.

Lazy Loading: Implemented lazy loading for API targets in TestExecutor.ts to ensure the registry populates exactly at the start of an api-call step.

Result Telemetry: Updated the execution loop to capture real network data (Status Codes, URLs) and live durations for API actions.

### Fixed
Memory Starvation: Fixed a bug where the Orchestrator withheld CTR definitions from the engine during non-Playwright runs.

Registry Mapping: Fixed a "Target not found" error by ensuring API targets map directly to keys without UI-style namespace prefixing.

### Evidence
Success Metric: Successfully verified a live GET request to JSONPlaceholder, capturing a real 404 status and 1.59s network duration.

Report: Generated a valid HTML report under the api engine with passing steps and resolved targets.

## [Unreleased] – Execution Core Stabilization & Deterministic Orchestration

### Added
- Bounded parallel orchestration with worker pool.
- Deterministic result aggregation preserving suite order.
- Proper worker degeneration: `--workers 1` behaves identically to sequential mode.

### Changed
- Removed legacy `runner.ts`.
- Introduced `SuiteCoordinator` as single orchestration entry.
- Introduced `TestExecutor` as isolated execution engine.
- Clarified separation between orchestration and test execution.

### Verified
- Retry semantics preserved.
- CLR resolution and reporting preserved.
- Skip model remains compile-time.
- Summary math and signal calculation intact.
- Artifact escalation per retry intact.
- No shared browser/context leakage across tests.

## [Unreleased] – CLR Runtime & Report Surface Alignment

### Added
- Full runtime CLR resolution via logical element keys.
- HTML report now renders CLR logical keys as primary step target.
- Resolved locators displayed as collapsible implementation detail.

### Changed
- Steps using CLR targets now preserve semantic identity in run results.
- Mixed-mode support retained: literal selectors remain supported when not defined in CLR.

### Notes
- No breaking changes.
- Data-only migration required for tests moving from literal selectors to CLR keys.

## [Unreleased] – 2026-02-23

### Changed
- CLR semantic shift completed.
- `logicalKey` promoted to primary step identity across execution and reporting.
- Locator demoted to execution adapter concern (no longer surfaced in reports).
- Evidence structures aligned with model semantics.
- `clr.json` introduced as resolution contract input for element location.
- Schemas (`artifacts`, `results`) updated accordingly.
- Examples updated to reflect logicalKey-first structure.

### Notes
- No architectural boundary crossings.
- No execution model changes.
- Deterministic evidence model preserved.

## [v1.2.0] – 2026-02-04

### Added
- Deterministic runtime artifact capture (trace, video, screenshot) on failure only
- Append-only `artifacts.json` evidence index per run
- Self-contained HTML report per run session
- Evidence links (trace, video, screenshots) opening in new tabs
- Canonical file URL emission for generated HTML report

### Fixed
- Correct file URI generation across platforms (Windows/macOS/Linux)
- Guaranteed artifact directory creation per attempt
- Proper trace lifecycle handling (no empty traces on pass)

### Notes
- HTML reports are strictly derived views over raw JSON artifacts
- No inference, aggregation, or cross-run logic introduced
- Phase 2 is frozen as a stable foundation for Observatory work

## [v1.0.0] – 2026-02-03 — Open Core Foundation

### Removed
Deprecated `diff` and `flaky` tool implementations from Core.
These were legacy, unreferenced artifacts from early exploratory phases.
Divergence detection and flakiness classification are analysis concerns and belong to Observatory.

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


