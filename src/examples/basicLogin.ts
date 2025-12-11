import { CoreRunner, JsonTestDefinition } from "..";

const loginFlow: JsonTestDefinition = {
  name: "Basic login",
  steps: [
    { action: "goto", target: "https://example.com/login" },
    { action: "fill", target: "#username", value: "demo" },
    { action: "fill", target: "#password", value: "secret" },
    { action: "click", target: "#login" },
    { action: "assertVisible", target: "#dashboard" }
  ]
};

(async () => {
  const runner = new CoreRunner({ headless: true });
  await runner.run(loginFlow);
  await runner.dispose();
})();
