// src/core/EventBus.ts
// Enhanced EventBus with schema registration de-duplication, JSON schema validation (Ajv),
// and a bounded in-memory event log for diagnostics.

import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { EventPayload, EventSchema } from '../Types/plugin';

export class EventBusImpl {
  private listeners = new Map<string, Set<(payload: EventPayload) => void>>();

  // We de-dupe using a key of `${name}@${version}` so repeated calls do not spam logs
  private schemaKeys = new Set<string>();
  private schemaValidators = new Map<string, ValidateFunction>();

  private ajv: Ajv;

  private eventLog: Array<{
    timestamp: number;
    event: string;
    payload: EventPayload;
  }> = [];

  private maxLogSize = 1000; // keep last 1000 events for diagnostics

  constructor(coreSchemas: EventSchema[] = []) {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);

    // Optionally seed core schemas once at construction
    if (Array.isArray(coreSchemas)) {
      for (const schema of coreSchemas) {
        try {
          this.registerSchema(schema);
        } catch (err) {
          // Intentionally swallow schema errors at boot so the host can continue
          // but still surface them to the console for developers.
          console.warn('[EventBus] Failed to register core schema', schema?.name, schema?.version, err);
        }
      }
    }
  }

  /** Register (name, version, jsonSchema/payloadSchema). Safe to call multiple times; duplicates are ignored. */
  registerSchema(schema: EventSchema): void {
    if (!schema || typeof schema !== 'object') {
      throw new Error('registerSchema: invalid schema object');
    }

    const { name, version } = schema as { name: string; version: string };
    const jsonSchema = (schema as any).jsonSchema ?? (schema as any).payloadSchema;

    if (!name || !version || !jsonSchema) {
      throw new Error('registerSchema: schema must include name, version, and jsonSchema or payloadSchema');
    }

    const key = `${name}@${version}`;
    if (this.schemaKeys.has(key)) {
      // silently ignore duplicates to avoid console spam
      return;
    }

    const validate = this.ajv.compile(jsonSchema);
    this.schemaValidators.set(key, validate);
    this.schemaKeys.add(key);

    // Developer signal for visibility while avoiding repeated prints
    // Only log on first-time registration
    console.log(`Event schema registered: ${name}@${version}`);
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * Event string MUST be of the shape `${name}@${version}` to align with schemas.
   */
  subscribe(event: string, handler: (payload: EventPayload) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  /** Emit event with optional dev-time schema validation and bounded logging. */
  emit(event: string, payload: EventPayload): void {
    // Bounded log for diagnostics
    this.eventLog.push({ timestamp: Date.now(), event, payload });
    if (this.eventLog.length > this.maxLogSize) this.eventLog.shift();

    // Validate if a schema exists for this event key
    const validator = this.schemaValidators.get(event);
    if (validator) {
      const ok = validator(payload);
      if (!ok) {
        const message = `[EventBus] Schema validation failed for ${event}: ${this.ajv.errorsText(validator.errors, { separator: '\n' })}`;
        if (import.meta.env.DEV) {
          console.warn(message, { payload, errors: validator.errors });
        }
        // We do not throw; we continue so the host remains resilient.
      }
    }

    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Handler threw for ${event}:`, err);
        // Continue dispatch to the remainder; do not let one plugin crash others
      }
    }
  }

  /** Optionally expose the last N events for diagnostics/UI panels. */
  getRecentEvents(limit = 100): Array<{ timestamp: number; event: string; payload: EventPayload }> {
    if (limit <= 0) return [];
    const start = Math.max(0, this.eventLog.length - limit);
    return this.eventLog.slice(start);
  }
}
