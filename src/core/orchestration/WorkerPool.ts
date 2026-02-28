/* ============================================================
   Testergizer Orchestration — Worker Pool

   Implements bounded, engine-agnostic concurrency using
   logical worker slots.

   Responsibilities:
   - Enforce max parallelism
   - Lease and release worker IDs
   - Execute scheduled tasks
   - Never mutate shared suite state
   - Never determine final ordering

   This component does NOT:
   - Perform aggregation
   - Interpret payload semantics
   - Know anything about Playwright/API/etc.

   Concurrency is promise-based and deterministic by design.
   ============================================================ */

import type { ScheduledTask, WorkerExecutionResult } from "./types";

export class WorkerPool {
  private readonly maxWorkers: number;
  private readonly workerQueue: number[] = [];
  private activeCount = 0;

  constructor(maxWorkers: number) {
    if (!Number.isFinite(maxWorkers) || maxWorkers < 1) {
      throw new Error("WorkerPool requires a positive worker count");
    }

    this.maxWorkers = maxWorkers;

    // Initialize logical worker IDs (1-based).
    for (let i = 1; i <= maxWorkers; i++) {
      this.workerQueue.push(i);
    }
  }

  /**
   * Executes all scheduled tasks with bounded concurrency.
   * Returns results as they complete (NOT ordered).
   */
  async run<T>(tasks: ScheduledTask<T>[]): Promise<WorkerExecutionResult<T>[]> {
    const results: WorkerExecutionResult<T>[] = [];
    const pending = [...tasks];

    return new Promise<WorkerExecutionResult<T>[]>((resolve, reject) => {
      const trySchedule = () => {
        // Done when no pending and no active.
        if (pending.length === 0 && this.activeCount === 0) {
          return resolve(results);
        }

        while (this.activeCount < this.maxWorkers && pending.length > 0) {
          const task = pending.shift()!;
          const workerId = this.acquireWorker();
          this.activeCount++;

          task
            .execute(workerId)
            .then((payload) => {
              results.push({
                index: task.index,
                workerId,
                result: payload
              });
            })
            .catch((err) => {
              // Orchestrator decides error policy; we fail fast here.
              reject(err);
            })
            .finally(() => {
              this.releaseWorker(workerId);
              this.activeCount--;
              trySchedule();
            });
        }
      };

      trySchedule();
    });
  }

  private acquireWorker(): number {
    const id = this.workerQueue.shift();
    if (id === undefined) {
      throw new Error("No available worker slot");
    }
    return id;
  }

  private releaseWorker(workerId: number): void {
    this.workerQueue.push(workerId);
  }
}