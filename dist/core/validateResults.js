"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateResults = validateResults;
const ajv_1 = __importDefault(require("ajv"));
const results_v1_json_1 = __importDefault(require("../../schemas/results.v1.json"));
const ajv = new ajv_1.default({ allErrors: true, strict: true });
const validate = ajv.compile(results_v1_json_1.default);
function validateResults(results) {
    if (!validate(results)) {
        const errors = (validate.errors ?? []);
        const msg = errors
            .map(e => `${e.instancePath || "/"} ${e.message}`)
            .join("\n");
        throw new Error(`Results schema validation failed:\n${msg}`);
    }
}
