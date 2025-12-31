import type { Page } from "playwright";
import type { JsonStep } from "../types";

export interface StepExecutor {
  execute(step: JsonStep, page: Page | null): Promise<void>;
}
