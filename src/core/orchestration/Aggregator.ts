/* ============================================================
   Testergizer Orchestration — Deterministic Aggregator

   Provides single-writer result assembly.

   Responsibilities:
   - Preallocate result array by task count
   - Commit payload by deterministic index
   - Guarantee deterministic ordering regardless of completion timing
   - Produce immutable orchestration output

   Workers MUST NOT mutate shared arrays directly.
   ============================================================ */

import type { OrchestrationResult, WorkerExecutionResult } from "./types";

export class Aggregator<T> {
  private readonly slots: (T | undefined)[];
  private readonly total: number;

  constructor(totalTasks: number) {
    if (!Number.isFinite(totalTasks) || totalTasks < 0) {
      throw new Error("Aggregator requires non-negative task count");
    }

    this.total = totalTasks;
    this.slots = new Array(totalTasks);
  }

  commit(execution: WorkerExecutionResult<T>): void {
    const { index, result } = execution;

    if (index < 0 || index >= this.total) {
      throw new Error(`Aggregator received out-of-bounds index: ${index}`);
    }

    if (this.slots[index] !== undefined) {
      throw new Error(`Aggregator received duplicate result for index: ${index}`);
    }

    this.slots[index] = result;
  }

  finalize(parallelismUsed: number, cpuCoresDetected: number): OrchestrationResult<T> {
    for (let i = 0; i < this.total; i++) {
      if (this.slots[i] === undefined) {
        throw new Error(`Aggregator missing result for index: ${i}`);
      }
    }

    return {
      items: this.slots as T[],
      parallelismUsed,
      cpuCoresDetected
    };
  }
}