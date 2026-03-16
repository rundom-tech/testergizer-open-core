import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionContext } from './ExecutionContext';
import { VarianceResolver } from './VarianceResolver';

describe('VarianceResolver - Sprint 4 Chaining & State Capture', () => {
  let context: ExecutionContext;
  let resolver: VarianceResolver;

  beforeEach(() => {
    // Start each test with a clean context and basic initial variables
    context = new ExecutionContext({
      baseUrl: 'https://api.example.com',
      tenantId: 'alpha-100'
    });
    resolver = new VarianceResolver(context);
  });

  it('resolves initial static variables in strings', () => {
    const rawUrl = '{{baseUrl}}/users?tenant={{tenantId}}';
    const resolvedUrl = resolver.resolveString(rawUrl);
    
    expect(resolvedUrl).toBe('https://api.example.com/users?tenant=alpha-100');
  });

  it('Sprint 4: resolves variables injected mid-execution (Output-to-Input chaining)', () => {
    // 1. Simulate Step A (API/UI Extractor) mutating the context
    context.set('dynamicUserId', 999, 'number');
    context.set('sessionToken', 'xyz-789', 'string');

    // 2. Simulate Step B resolving its payload using the updated context
    const stepBPayload = {
      user: '{{dynamicUserId}}',
      headers: {
        Authorization: 'Bearer {{sessionToken}}'
      }
    };

    const resolvedPayload = resolver.resolveObject(stepBPayload);

    // 3. Verify the chaining succeeded
    expect(resolvedPayload.user).toBe(999); 
    expect(resolvedPayload.headers.Authorization).toBe('Bearer xyz-789');
  });

  it('Sprint 4: preserves type transformations when resolving direct matches in objects', () => {
    // If an entire value is just the variable, a robust resolver should preserve the type
    context.set('isActive', 'true', 'boolean');
    context.set('retryCount', '3', 'number');

    const rawData = {
      active: '{{isActive}}',
      retries: '{{retryCount}}',
      mixed: 'Count is {{retryCount}}'
    };

    const resolvedData = resolver.resolveObject(rawData);

    // Assuming VarianceResolver.resolveObject is smart enough to cast exact matches
    // If your resolver strictly returns strings, you can adjust this expectation.
    expect(resolvedData.active).toBe(true);
    expect(resolvedData.retries).toBe(3);
    
    // Mixed strings should always remain strings
    expect(resolvedData.mixed).toBe('Count is 3');
  });

  it('protects and resolves system macros alongside dynamic variables', () => {
    // Simulate capturing a state variable
    context.set('capturedId', 'abc-123');

    const rawPayload = {
      id: '{{$guid}}',
      createdAt: '{{$timestamp}}',
      reference: '{{capturedId}}'
    };

    const resolvedPayload = resolver.resolveObject(rawPayload);

    // Verify macro generation
    expect(resolvedPayload.id).toBeDefined();
    expect(resolvedPayload.id).not.toBe('{{$guid}}');
    expect(typeof resolvedPayload.createdAt).toBe('number');
    
    // Verify chained state
    expect(resolvedPayload.reference).toBe('abc-123');
  });

  it('leaves unresolved variables intact for debugging', () => {
    const rawString = 'Hello {{missingName}}';
    const resolvedString = resolver.resolveString(rawString);
    
    expect(resolvedString).toBe('Hello {{missingName}}');
  });

  it('throws an error if an extractor attempts to overwrite a protected macro', () => {
    expect(() => {
      context.set('$guid', 'malicious-override');
    }).toThrow(/Protection Violation/);
  });
});