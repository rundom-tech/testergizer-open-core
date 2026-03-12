export class LocatorsError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class InvalidTargetError extends LocatorsError {
  constructor(target: string) {
    super(
      'INVALID_TARGET',
      `Invalid target "${target}". Expected format: <context>.<logicalName>.<type>`
    );
  }
}

export class UnknownElementKeyError extends LocatorsError {
  constructor(elementKey: string, knownKeysSample?: string[]) {
    const suffix =
      knownKeysSample && knownKeysSample.length
        ? ` Known keys sample: ${knownKeysSample.slice(0, 10).join(', ')}`
        : '';
    super('UNKNOWN_ELEMENT_KEY', `Unknown elementKey "${elementKey}".${suffix}`);
  }
}

export class ContextNotAllowedError extends LocatorsError {
  constructor(context: string, elementKey: string, allowed: string[]) {
    super(
      'CONTEXT_NOT_ALLOWED',
      `Element "${elementKey}" is not valid in context "${context}". Allowed contexts: ${allowed.join(', ')}`
    );
  }
}

export class NoStrategyResolvedError extends LocatorsError {
  constructor(context: string, target: string) {
    super(
      'NO_STRATEGY_RESOLVED',
      `Failed to resolve target "${target}" in context "${context}". All strategies failed.`
    );
  }
}
