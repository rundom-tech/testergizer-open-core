import { StepResult } from "../resultTypes";

export class DbExecutor {
  async execute(step: any): Promise<Partial<StepResult>> {
    return {
      status: "passed",
      data: {
        value: "CORE_STUB",
        audit: [{
          check: step.action,
          path: step.target,
          passed: true,
          detail: "[Open Core] Database action recognized. SQL fulfillment requires @testergizer/addon-db."
        }]
      }
    };
  }
}