"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyRetry = classifyRetry;
function classifyRetry(err) {
    const msg = String(err?.message ?? "");
    if (/timeout/i.test(msg))
        return "timeout";
    if (/assertion failed/i.test(msg))
        return "assertion";
    if (/page\.goto|net::|navigation/i.test(msg))
        return "navigation";
    return "unknown";
}
