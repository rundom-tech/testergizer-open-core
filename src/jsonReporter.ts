type Run = {
  runId: string;
  suiteId: string;
  startedAt?: string;
  endedAt?: string;
  runnerVersion?: string;
  tests: Test[];
};

type Test = {
  id: string;
  status: string;
  steps: Step[];
};

type Step = {
  id: string;
  action: string;
  status: string;
  attempts?: number;
  attemptErrors?: unknown[];
};

export function emitResults(run: Run) {
  return {
    schemaVersion: "v1",
    suiteId: run.suiteId,
    runId: run.runId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    meta: {
      runnerVersion: run.runnerVersion
    },
    tests: run.tests.map((test: Test) => ({
      id: test.id,
      status: test.status,
      steps: test.steps.map((step: Step) => ({
        id: step.id,
        action: step.action.toUpperCase(),
        status: step.status,
        attempts: step.attempts,
        attemptErrors: step.attemptErrors ?? []
      }))
    }))
  };
}
