import { TestExecutor } from "./TestExecutor";
import { JsonTestDefinition, TestExecutorOptions, JsonStep } from "./types";

// Local extension to satisfy TSC without breaking core types.ts
interface ExtendedOptions extends TestExecutorOptions {
  variables?: Record<string, any>;
}

interface ExtendedStep extends JsonStep {
  data?: any;
}

async function runUiTest() {
  console.log("Starting SPRINT 3 UI Variance Test...\n");

  const options: ExtendedOptions = {
    executionEngine: "playwright",
    browserName: "chromium",
    headless: true,
    autVersion: "1.0.0",
    variables: {
      userId: "777",
      userName: "Meir"
    },
    ctrDefinition: {
      appId: "demo-ui",
      versionRange: ">=1.0.0",
      domFingerprint: "mock-fingerprint",
      locators: {
        "WEB.USERS.BTN_DELETE_777": {
          selectors: [{ using: "css", value: "button[data-id='777']" }]
        }
      }
    } as any
  };

  const executor = new TestExecutor(options as TestExecutorOptions);

  const testDef: JsonTestDefinition = {
    id: "ui-variance-test",
    name: "UI Variance Resolution Test",
    steps: [
      {
        id: "step-1",
        action: "click",
        target: "WEB.USERS.BTN_DELETE_{{userId}}",
        data: { 
          logMessage: "Attempting to delete user: {{userName}}" 
        }
      } as ExtendedStep
    ]
  };

  try {
    const result = await executor.execute(testDef);
    const attempt = result.attempts[0];
    const step = attempt.steps[0];
    
    console.log("Verdict:", result.result === "failed" ? "✅ RESOLUTION SUCCESS" : "❌ FAIL");
    console.log("\nStep Data (Resolved):", JSON.stringify(step.data?.value, null, 2));
    console.log("\nError:", step.errors?.[0]?.message);

  } catch (error) {
    console.error("Test execution aborted:", error);
  }
}

runUiTest();