import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "../../schemas/results.schema.json";

const ajv = new Ajv({ 
  allErrors: true, 
  strict: true 
});

addFormats(ajv);

const validate = ajv.compile(schema);

export function validateResults(results: any) {
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
