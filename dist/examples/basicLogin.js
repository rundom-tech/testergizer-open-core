"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CoreRunner_1 = require("../core/CoreRunner");
const test = {
    id: "basic-login",
    steps: [
        { id: "goto", action: "goto", target: "https://example.com" },
        { id: "click-login", action: "click", target: "#login" },
    ],
};
async function run() {
    const runner = new CoreRunner_1.CoreRunner({ executionMode: "stub" });
    await runner.run(test);
    await runner.dispose();
}
run().catch(console.error);
