export function executeStep(step: any) {
  step.attempts = 1;
  step.attemptErrors = [];

  switch (step.action) {
    case "goto":
    case "assert":
    case "click":
    case "fill":
      step.status = "passed";
      return;
    default:
      step.status = "failed";
      step.attemptErrors.push({
        reason: "Error",
        message: `Unknown step action: ${step.action}`
      });
      return;
  }
}