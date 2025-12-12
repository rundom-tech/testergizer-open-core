
import Ajv from "ajv";
import schema from "../../schemas/results.v1.json";

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateResults(results: any) {
  if (!validate(results)) {
    const msg = validate.errors
      ?.map(e => `${e.instancePath} ${e.message}`)
      .join("\n");
    throw new Error(`Results schema validation failed:\n${msg}`);
  }
}
