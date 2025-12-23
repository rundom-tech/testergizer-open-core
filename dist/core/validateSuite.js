"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSuite = validateSuite;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const suite_schema_json_1 = __importDefault(require("../../schemas/suite.schema.json"));
const ajv = new ajv_1.default({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
});
(0, ajv_formats_1.default)(ajv);
const validate = ajv.compile(suite_schema_json_1.default);
function validateSuite(suite) {
    if (!validate(suite)) {
        const errors = (validate.errors ?? []);
        const msg = errors.map(e => `${e.instancePath || "/"} ${e.message}`).join("\n");
        throw new Error(`Suite schema validation failed:\n${msg}`);
    }
}
