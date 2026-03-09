import { StepResult } from "../resultTypes";

export class EmailExecutor {
  async execute(step: any): Promise<Partial<StepResult>> {
    return {
      status: "passed",
      data: {
        value: "CORE_STUB",
        audit: [{
          check: step.action,
          path: step.target,
          passed: true,
          detail: "[Open Core] Email action recognized. Physical fulfillment requires @testergizer/addon-email."
        }]
      }
    };
  }
}