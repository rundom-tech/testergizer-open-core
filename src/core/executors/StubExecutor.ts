import { StepExecutor } from "./StepExecutor";
import { JsonStep } from "../types";

export class StubExecutor implements StepExecutor {
  async execute(step: JsonStep): Promise<void> {
    return;
  }
}