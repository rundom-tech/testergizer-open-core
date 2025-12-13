"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSuite = validateSuite;
const ajv_1 = __importDefault(require("ajv"));
const test_suite_v1_json_1 = __importDefault(require("../../schemas/test-suite.v1.json"));
const ajv = new ajv_1.default({ allErrors: true, strict: true });
const validate = ajv.compile(test_suite_v1_json_1.default);
function validateSuite(suite) {
    if (!validate(suite)) {
        const errors = (validate.errors ?? []);
        const msg = errors.map(e => `${e.instancePath || "/"} ${e.message}`).join("\n");
        throw new Error(`Suite schema validation failed:\n${msg}`);
    }
}
