export function emitResults(run) {
  return {
    schemaVersion: "v1",
    suiteId: run.suiteId,
    runId: run.runId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    meta: {
      runnerVersion: run.runnerVersion
    },
    tests: run.tests.map(test => ({
      id: test.id,
      status: test.status,
      steps: test.steps.map(step => ({
        id: step.id,
        action: step.action,
        status: step.status,
        attempts: step.attempts,
        attemptErrors: step.attemptErrors || []
      }))
    }))
  };
}
