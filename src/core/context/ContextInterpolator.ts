import { ExecutionContext } from './ExecutionContext'; // Adjust extension/name as needed

/**
 * Interpolates template strings (e.g., '{{userId}}') against the current ExecutionContext.
 * Returns the raw template if it is not a valid template string.
 */
export function interpolateContext(template: string, context: ExecutionContext): any {
  // 1. Verify it's an actual template string
  if (typeof template !== 'string' || !template.startsWith('{{') || !template.endsWith('}}')) {
    return template;
  }

  // 2. Extract the exact key: "{{userId}}" -> "userId", "{{$timestamp}}" -> "$timestamp"
  const key = template.slice(2, -2).trim();

  // 3. Leverage the ExecutionContext's built-in macro and variable retrieval
  const resolvedValue = context.get(key);

  // 4. Strict Failure: ExecutionContext returns `{{key}}` when a variable is missing.
  // In the context of Quality Intelligence governance, missing state is a fatal error.
  if (resolvedValue === `{{${key}}}`) {
    throw new Error(`Context Interpolation Error: Variable or macro '${key}' not found in ExecutionContext state.`);
  }

  return resolvedValue;
}