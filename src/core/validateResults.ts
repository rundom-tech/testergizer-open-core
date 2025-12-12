import Ajv, { ErrorObject } from "ajv";
import schema from "../../schemas/results.v1.json";

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateResults(results: unknown) {
  if (!validate(results)) {
    const errors = (validate.errors ?? []) as ErrorObject[];
    const msg = errors.map(e => `${e.instancePath || "/"} ${e.message}`).join("\n");
    throw new Error(`Results schema validation failed:\n${msg}`);
  }
}
