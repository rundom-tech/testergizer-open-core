import { JsonStep } from "../types";
import { Page } from "playwright";

export interface StepExecutor {
  execute(step: JsonStep, page: Page | null): Promise<void>;
}