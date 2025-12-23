import { CoreRunner } from "../core/CoreRunner";
import { JsonTestDefinition } from "../core/types";

const test: JsonTestDefinition = {
  id: "basic-login",
  steps: [
    { id: "goto", action: "goto", target: "https://example.com" },
    { id: "click-login", action: "click", target: "#login" },
  ],
};

async function run() {
  const runner = new CoreRunner({ executionMode: "stub" });
  await runner.run(test);
  await runner.dispose();
}

run().catch(console.error);