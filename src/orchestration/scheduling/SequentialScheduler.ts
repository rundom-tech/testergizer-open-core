// src/orchestration/scheduling/SequentialScheduler.ts
import type { SchedulingConfig, SuiteScheduler } from "./SuiteScheduler";

export class SequentialScheduler implements SuiteScheduler {
  public readonly config: SchedulingConfig;

  public constructor() {
    this.config = { strategy: "sequential", workers: 1 };
  }

  public async run<T>(
    items: T[],
    worker: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i++) {
      await worker(items[i], i);
    }
  }
}