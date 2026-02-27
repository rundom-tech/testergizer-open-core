# Maestro Orchestration & Temporal Governance  
## SPRINT_PLAN.md

Branch: `feature/orchestration-parallel-scheduling`

This document defines the sprint-by-sprint execution plan for the Maestro Orchestration program.  
Each sprint is self-contained, governed by CONTRACT.md, and must conclude with an artifact-based validation session.

No cross-sprint feature creep is allowed.

---

# OVERALL PROGRAM OBJECTIVE

Establish a deterministic, parallel, evidence-governed orchestration layer aligned with the Quality Intelligence framework.

Deliver:

- Deterministic parallel execution
- Explicit execution planning
- Duration-aware scheduling
- Retry governance
- Temporal signal metadata capture
- Reporting aligned with orchestration topology

Exclude:

- Adaptive telemetry
- CPU auto-scaling
- Generic CI abstraction
- Statistical drift analytics

---

# SPRINT 1 — Deterministic Parallel Execution Core

## Commit
`feat(orchestration): introduce deterministic parallel worker pool and aggregator`

## Scope

### New Files
- `src/core/orchestration/Orchestrator.ts`
- `src/core/orchestration/WorkerPool.ts`
- `src/core/orchestration/Aggregator.ts`
- `src/core/orchestration/types.ts`

### Full Replacement
- `CoreRunner.ts`
- `htmlReporter.ts` (if required)
- `resultTypes.ts` (if required)

## Functional Goals
- Bounded parallel execution (`--parallel`)
- CPU core fallback
- Single-writer aggregation
- Artifact isolation per attempt
- Worker ID logging

## Reporting Goals
- Show parallelism used
- Show CPU cores detected
- Show worker ID per attempt

## Validation Session
- Compare `--parallel 1` vs legacy sequential engine
- Validate deterministic result ordering
- Validate artifact isolation
- Validate HTML report changes

Tag after completion:
`ORCH_S1_DONE`

---

# SPRINT 2 — Persisted Execution Plan

## Commit
`feat(orchestration): introduce RunPlanner and persisted execution plan`

## Scope

### New Files
- `src/core/orchestration/RunPlanner.ts`
- `src/core/orchestration/RunPlan.ts`

### Full Replacement
- `Orchestrator.ts`
- `CoreRunner.ts`
- `htmlReporter.ts`

## Functional Goals
- Explicit RunPlan abstraction
- Execution consumes RunPlan only
- Plan serialized into run.json
- FIFO scheduling preserved

## Reporting Goals
- Collapsible Execution Plan section
- Planned vs actual order comparison

## Validation Session
- Two identical runs produce identical plans
- Planned order equals execution order
- Plan visible in run.json
- No regression from Sprint 1

Tag:
`ORCH_S2_DONE`

---

# SPRINT 3 — Duration-Aware Scheduling (LPT)

## Commit
`feat(tempo): add duration-aware scheduling (LPT) with historical median estimation`

## Scope

### New File
- `src/core/orchestration/DurationModel.ts`

### Full Replacement
- `RunPlanner.ts`
- `htmlReporter.ts`

## Functional Goals
- Load historical durations from run.json
- Median estimation per test
- Longest Processing Time (LPT) scheduling
- estimatedDurationMs stored in RunPlan

## Reporting Goals
- Estimated vs actual duration per test
- Duration delta display
- Suite-level mean, std dev, P95

## Validation Session
- Confirm LPT ordering
- Measure wall time vs FIFO
- Validate determinism across repeated runs
- Validate reporting output

Tag:
`ORCH_S3_DONE`

---

# SPRINT 4 — Deterministic Retry Governance & Topology Trace

## Commit
`feat(orchestration): deterministic retry requeue and topology trace logging`

## Scope

### Full Replacement
- `WorkerPool.ts`
- `Aggregator.ts`
- `resultTypes.ts`
- `htmlReporter.ts`

## Functional Goals
- Retry placed at queue tail
- Retry queue position logged
- Worker ID preserved
- Attempt topology trace recorded

## Reporting Goals
- Retry clustering visualization
- Retry queue position per attempt
- Attempt timeline section
- Topology summary metrics

## Validation Session
- Simulated flaky test
- Retry appears at tail
- Deterministic retry ordering
- No retry storm amplification
- Report reflects topology accurately

Tag:
`ORCH_S4_DONE`

---

# SPRINT 5 — Temporal Signal Metadata Capture

## Commit
`feat(tempo): add temporal signal metadata capture for future drift analysis`

## Scope

### Full Replacement
- `RunPlan.ts`
- `Aggregator.ts`
- `Orchestrator.ts`
- `htmlReporter.ts`

## Functional Goals

Per attempt:
- queuedAt
- startedAt
- endedAt
- plannedOrder
- actualStartIndex

Per run:
- schedulerStrategy
- maxParallelRequested
- maxParallelEffective
- cpuCoresDetected

No adaptive scaling introduced.

## Reporting Goals
- Temporal Diagnostics section
- Duration distribution summary
- Planned vs actual deviation table
- Execution topology overview

## Validation Session
- Compare identical runs for stability
- Validate metadata completeness
- Confirm no regression from Sprint 4

Tag:
`ORCH_S5_DONE`

---

# SPRINT 6 (Optional) — Shard-Aware Weighted Scheduling

## Commit
`feat(tempo): add shard-aware weighted bin packing scheduling`

## Scope

### New File
- `ShardBalancer.ts`

### Full Replacement
- `RunPlanner.ts`
- `htmlReporter.ts`

## Functional Goals
- Weighted bin packing shard allocation
- Deterministic shard persistence

## Reporting Goals
- Shard allocation section
- Per-shard duration balance display

## Validation Session
- Deterministic shard assignments
- Balanced shard duration distribution
- No semantic changes

Tag:
`ORCH_S6_DONE`

---

# OPERATING PROTOCOL

Before each sprint:
- Tag starting point
- Freeze scope

During sprint:
- Full file replacements preferred
- No cross-sprint modifications

After sprint:
- Artifact-based validation session
- Tag sprint completion
- Update CHANGELOG.md if needed

---

# COMPLETION CRITERIA

Program complete when:

- ORCH_S1 through ORCH_S5 validated
- Deterministic parallel execution stable
- Execution plan auditable
- Retry governance enforced
- Temporal signal foundation established

Only then may adaptive or analytical extensions be considered.