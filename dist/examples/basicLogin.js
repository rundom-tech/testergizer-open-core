"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("..");
const loginFlow = {
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
    const runner = new __1.CoreRunner({ headless: true });
    await runner.run(loginFlow);
    await runner.dispose();
})();
