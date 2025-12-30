"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateResults = validateResults;
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const results_schema_json_1 = __importDefault(require("../../schemas/results.schema.json"));
const ajv = new _2020_1.default({
    allErrors: true,
    strict: true
});
(0, ajv_formats_1.default)(ajv);
const validate = ajv.compile(results_schema_json_1.default);
function validateResults(results) {
    if (!validate(results)) {
        /*const msg = validate.errors
          ?.map(e => `${e.instancePath} ${e.message}`)
          .join("\n");
        throw new Error(`Results schema validation failed:\n${msg}`);*/
        const msg = validate.errors
            ?.map(e => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`)
            .join("\n");
        throw new Error(`Results schema validation failed:\n${msg}`);
    }
}
