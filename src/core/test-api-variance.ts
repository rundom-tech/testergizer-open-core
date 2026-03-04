// src/core/test-api-variance.ts
import { ApiTargetRegistry } from "./api/ApiRepository";
import { ApiExecutor } from "./executors/ApiExecutor";
import { ApiExecutable } from "./api/types";

async function runTest() {
  console.log("Starting SPRINT 3 API Variance Test...\n");

  // 1. Mock the CTR (simulating endpoints.json + standard-headers.json)
  const registry = new ApiTargetRegistry();
  registry.loadFromObject({
    endpoints: {
      "T-USER-POSTS": {
        url: "https://jsonplaceholder.typicode.com/posts",
        defaultMethod: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "X-Testergizer-Trace": "{{$guid}}" // Verifying dynamic system macro resolution
        }
      }
    }
  });

  // 2. Initialize the Executor
  const executor = new ApiExecutor(registry);

  // 3. Define the Executable (simulating a test definition)
  const testDef: ApiExecutable = {
    id: "run-create-post",
    version: "2.0",
    targetRef: "T-USER-POSTS",
    payload: {
      title: "Open Core Integration by {{userName}}", // Verifying static variable injection
      body: "Testing deep payload resolution.",
      userId: 1
    },
    assertions: [
      { check: "status_code", expected: 201 },
      { check: "json_path", expected: 1, path: "userId" }
    ]
  };

  // 4. Define the Execution Context Variables
  const variables = {
    userName: "Meir"
  };

  try {
    // 5. Execute the test
    // Note: In the refactored ApiExecutor, these variables initialize the internal ExecutionContext
    const result = await executor.execute(testDef, variables);
    
    console.log("Verdict:", result.passed ? "✅ PASSED" : "❌ FAILED");
    console.log("Status Code:", result.status_code);
    console.log("Duration:", `${result.durationMs}ms`);
    console.log("Resolved URL:", result.url);
    
    // 6. Inspect the returned body 
    // JSONPlaceholder echoes the POST payload, allowing us to see the resolved "title"
    console.log("\nEchoed Body (Notice the resolved title):");
    console.log(JSON.stringify(result.body, null, 2));

    if (result.assertionErrors.length > 0) {
      console.log("\nAssertion Errors:");
      result.assertionErrors.forEach((err: string) => console.log(`- ${err}`));
    }

  } catch (error) {
    console.error("Execution failed:", error);
  }
}

runTest();