import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../schemas/results.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile(schema);

export function validateResults(results: unknown): void {
  if (!validate(results)) {
    const msg = (validate.errors ?? [])
      .map(e => `${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`)
      .join("\n");
    throw new Error(`Results schema validation failed:\n${msg}`);
  }
}
