"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectMeta = collectMeta;
const child_process_1 = require("child_process");
const package_json_1 = __importDefault(require("../../package.json"));
function tryExec(cmd) {
    try {
        return (0, child_process_1.execSync)(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    }
    catch {
        return null;
    }
}
function collectMeta() {
    const dirty = (() => {
        const out = tryExec("git status --porcelain");
        return out ? true : false;
    })();
    return {
        runnerVersion: package_json_1.default.version ?? "0.0.0",
        git: {
            sha: tryExec("git rev-parse HEAD"),
            branch: tryExec("git rev-parse --abbrev-ref HEAD"),
            dirty
        },
        ci: {
            name: process.env.GITHUB_ACTIONS ? "github-actions" : (process.env.CI ? "ci" : null),
            runId: process.env.GITHUB_RUN_ID ?? null,
            job: process.env.GITHUB_JOB ?? null
        },
        env: {
            node: process.version,
            platform: process.platform
        }
    };
}
