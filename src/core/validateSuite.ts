import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../schemas/suite.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function validateSuite(suite: unknown): void {
  if (!validate(suite)) {
    const errors = validate.errors ?? [];
    const msg = errors.map(e => `${e.instancePath || "/"} ${e.message}`).join("\n");
    throw new Error(`Suite schema validation failed:\n${msg}`);
  }
}
