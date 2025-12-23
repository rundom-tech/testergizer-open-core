import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import schema from "../../schemas/suite.schema.json";

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  allowUnionTypes: true
});

addFormats(ajv);

const validate = ajv.compile(schema);

export function validateSuite(suite: unknown) {
  if (!validate(suite)) {
    const errors = (validate.errors ?? []) as ErrorObject[];
    const msg = errors.map(e => `${e.instancePath || "/"} ${e.message}`).join("\n");
    throw new Error(`Suite schema validation failed:\n${msg}`);
  }
}
