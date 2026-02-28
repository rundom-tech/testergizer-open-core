/* ============================================================
   Testergizer Orchestration — Engine-Agnostic Coordinator

   High-level orchestration layer responsible for:

   - Resolving requested parallelism (including CPU fallback)
   - Managing WorkerPool lifecycle
   - Routing results through Aggregator
   - Returning ordered results + metadata

   This layer does NOT:
   - Implement task payload semantics
   - Alter retry logic
   - Perform reporting or summary calculations
   ============================================================ */

import os from "os";
import { WorkerPool } from "./WorkerPool";
import { Aggregator } from "./Aggregator";
import type { OrchestrationOptions, OrchestrationResult, ScheduledTask } from "./types";

export class Orchestrator {
  private readonly options: OrchestrationOptions;

  constructor(options: OrchestrationOptions) {
    this.options = options;
  }

  async run<T>(tasks: ScheduledTask<T>[]): Promise<OrchestrationResult<T>> {
    const cpuCoresDetected = this.options.cpuCoresDetected || os.cpus().length;
    const parallelismUsed = this.resolveParallelism(this.options.parallelism, cpuCoresDetected);

    // Sequential shortcut for strict equivalence and easier validation.
    if (parallelismUsed === 1) {
      const agg = new Aggregator<T>(tasks.length);

      for (const t of tasks) {
        const payload = await t.execute(1);
        agg.commit({ index: t.index, workerId: 1, result: payload });
      }

      return agg.finalize(parallelismUsed, cpuCoresDetected);
    }

    const pool = new WorkerPool(parallelismUsed);
    const agg = new Aggregator<T>(tasks.length);

    const completed = await pool.run(tasks);

    for (const execution of completed) {
      agg.commit(execution);
    }

    return agg.finalize(parallelismUsed, cpuCoresDetected);
  }

  private resolveParallelism(requested: number, cpuCoresDetected: number): number {
    if (!requested || requested === 0) return cpuCoresDetected;
    if (requested < 0) throw new Error(`Invalid parallelism value: ${requested}`);
    return Math.min(requested, cpuCoresDetected);
  }
}