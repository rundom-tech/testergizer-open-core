/* ============================================================
   Testergizer Orchestration — Core Types

   Defines the structural contract for deterministic,
   engine-agnostic parallel execution.

   Key principles:
   - Parallelization unit is a scheduled task (typically: one test).
   - Worker IDs are logical orchestration slots, not Playwright workers.
   - Ordering is restored deterministically using original suite index.
   - Orchestration is payload-agnostic: it executes tasks and returns
     ordered results, without interpreting their meaning.

   No runtime logic lives here.
   This file is purely declarative and must remain side-effect free.
   
   Worker slot tracking is an internal WorkerPool concern and is intentionally not part of the public orchestration types
   ============================================================ */

export interface ScheduledTask<T> {
  /**
   * Deterministic ordering key.
   * The Aggregator will commit results into this index.
   */
  index: number;

  /**
   * Human-friendly identifier for logs/debugging only.
   * Must not be used for ordering.
   */
  taskId: string;

  /**
   * Execute the entire unit of work.
   * Must not mutate shared suite state.
   */
  execute: (workerId: number) => Promise<T>;
}

export interface WorkerExecutionResult<T> {
  index: number; // deterministic ordering key
  workerId: number; // logical worker slot id
  result: T; // payload (engine-agnostic)
}

export interface OrchestrationOptions {
  /**
   * Requested parallelism from CLI.
   * 0 → CPU fallback
   * 1 → sequential
   */
  parallelism: number;

  /**
   * Number of CPU cores detected at orchestration start.
   */
  cpuCoresDetected: number;
}

export interface OrchestrationResult<T> {
  /**
   * Ordered results aligned to task.index.
   */
  items: T[];

  /**
   * Resolved parallelism after applying fallback/cap rules.
   */
  parallelismUsed: number;

  /**
   * CPU cores detected (used for reporting transparency).
   */
  cpuCoresDetected: number;
}