import type {
  LifecycleHooks,
  LifecycleRegistration,
} from "../internal/contracts.js";
import { createCompatError, ERROR_CODES } from "../contracts/errors.js";

/**
 * The one lifecycle contract every feature joins. Features never install their
 * own resize/loss/restore/dispose wiring: the session runs the registered hooks
 * in registration order (reverse for disposal) after the shared modules have
 * been reset, so a feature only reacts to the transition it owns.
 */
export interface LifecycleRegistry extends LifecycleRegistration {
  reset(): void;
  lost(): void;
  restored(): void;
  disposed(): void;
}

const HOOKS = ["reset", "lost", "restored", "disposed"] as const;
type HookName = (typeof HOOKS)[number];

function validate(hooks: LifecycleHooks): void {
  if (!hooks || typeof hooks !== "object")
    throw createCompatError(
      ERROR_CODES.CONTRACT,
      "lifecycle hooks must be an object",
    );
  for (const [name, value] of Object.entries(hooks)) {
    if (!(HOOKS as readonly string[]).includes(name))
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        `unknown lifecycle hook: ${name}`,
      );
    if (value !== undefined && typeof value !== "function")
      throw createCompatError(
        ERROR_CODES.CONTRACT,
        `lifecycle hook ${name} must be a function`,
      );
  }
}

type Entry = Readonly<{ hooks: LifecycleHooks }>;

export function createLifecycleRegistry(): LifecycleRegistry {
  const entries: Entry[] = [];
  const registered = new Set<LifecycleHooks>();
  let sealed = false;

  const run = (name: HookName, order: readonly Entry[]) => {
    const pending = [...order];
    let failed = false;
    let failure: unknown;
    for (const entry of pending) {
      try {
        entry.hooks[name]?.();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) throw failure;
  };

  return {
    register(hooks: LifecycleHooks): () => void {
      if (sealed)
        throw createCompatError(
          ERROR_CODES.DISPOSED,
          "lifecycle registry is disposed",
        );
      validate(hooks);
      if (registered.has(hooks))
        throw createCompatError(
          ERROR_CODES.CONTRACT,
          "duplicate lifecycle registration",
        );
      registered.add(hooks);
      const entry = Object.freeze({ hooks });
      entries.push(entry);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        registered.delete(hooks);
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
      };
    },
    reset(): void {
      run("reset", entries);
    },
    lost(): void {
      run("lost", entries);
    },
    restored(): void {
      run("restored", entries);
    },
    disposed(): void {
      if (sealed) return;
      sealed = true;
      registered.clear();
      run("disposed", [...entries].reverse());
      entries.length = 0;
    },
  };
}
