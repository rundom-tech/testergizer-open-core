# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] – 2025-12-23

### Changed
- Refactored execution architecture to unify all test execution under `CoreRunner`.
- CLI `run` command now delegates execution exclusively to `CoreRunner`; legacy step execution logic is no longer used.
- Introduced execution modes with an initial deterministic `stub` mode.
- Established executor abstraction to decouple step semantics from orchestration.

### Notes
- This release intentionally focuses on execution architecture only.
- Result generation, artifact writing, retries, screenshots, and analytics are out of scope for this version and will be introduced in subsequent releases.
- Schema validation (`validate`), diffing, and flaky analysis behavior remain unchanged.
