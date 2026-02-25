// src/orchestration/scheduling/SuiteScheduler.ts
export type SchedulingStrategy = "sequential" | "parallel-pool";

export interface SchedulingConfig {
  strategy: SchedulingStrategy;
  workers: number; // effective (>= 1)
}

/**
 * Suite-level scheduling strategy.
 *
 * Contract:
 * - Scheduler may execute items in any temporal order.
 * - Caller must aggregate results deterministically (typically by item index).
 */
export interface SuiteScheduler {
  readonly config: SchedulingConfig;

  run<T>(
    items: T[],
    worker: (item: T, index: number) => Promise<void>
  ): Promise<void>;
}