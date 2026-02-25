// src/orchestration/scheduling/ParallelPoolScheduler.ts
import type { SchedulingConfig, SuiteScheduler } from "./SuiteScheduler";

export class ParallelPoolScheduler implements SuiteScheduler {
  public readonly config: SchedulingConfig;

  public constructor(workers: number) {
    const effective = Number.isFinite(workers) ? Math.floor(workers) : 1;
    if (effective < 2) {
      throw new Error(
        `ParallelPoolScheduler requires workers >= 2. Got: ${workers}`
      );
    }

    this.config = { strategy: "parallel-pool", workers: effective };
  }

  public async run<T>(
    items: T[],
    worker: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    const concurrency = Math.min(this.config.workers, items.length);
    if (concurrency <= 1) {
      for (let i = 0; i < items.length; i++) {
        await worker(items[i], i);
      }
      return;
    }

    let nextIndex = 0;

    const runner = async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        await worker(items[current], current);
      }
    };

    const runners = Array.from({ length: concurrency }, () => runner());
    await Promise.all(runners);
  }
}