/**
 * Script runner — executes user pre-request / post-response scripts in an
 * isolated Web Worker (no DOM, dangerous globals shadowed). The API exposed to
 * scripts is `pc.*` (PostCat's own, not pm.*). See script.worker.ts.
 */

export type ScriptPhase = "pre" | "post";

export interface ScriptHeader {
  key: string;
  value: string;
}

export interface ScriptRequest {
  method: string;
  url: string;
  headers: ScriptHeader[];
  body: string;
}

export interface ScriptResponse {
  code: number;
  status: string;
  headers: ScriptHeader[];
  body: string;
  timeMs: number;
  sizeBytes: number;
}

export interface ScriptContext {
  request: ScriptRequest;
  response?: ScriptResponse;
  env: Record<string, string>;
  envName: string | null;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface LogLine {
  level: "log" | "warn" | "error";
  text: string;
}

export interface ScriptOutcome {
  ok: boolean;
  /** fatal error (syntax / thrown outside a test) */
  error?: string;
  /** mutated request fields (pre-request only) */
  request?: { method: string; url: string; headers: ScriptHeader[] };
  envSet: Record<string, string>;
  envUnset: string[];
  tests: TestResult[];
  logs: LogLine[];
}

const DEFAULT_TIMEOUT = 4000;

/** Run a script in a fresh worker; resolves with its outcome (never rejects). */
export function runScript(
  phase: ScriptPhase,
  code: string,
  ctx: ScriptContext,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<ScriptOutcome> {
  return new Promise((resolve) => {
    const empty: ScriptOutcome = { ok: true, envSet: {}, envUnset: [], tests: [], logs: [] };
    if (!code.trim()) {
      resolve(empty);
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("./sandbox.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      resolve({ ...empty, ok: false, error: `worker failed: ${String(e)}` });
      return;
    }

    const done = (out: ScriptOutcome) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(out);
    };

    const timer = setTimeout(() => {
      done({ ...empty, ok: false, error: `script timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    worker.onmessage = (ev: MessageEvent<ScriptOutcome>) => done(ev.data);
    worker.onerror = (ev) => done({ ...empty, ok: false, error: ev.message || "worker error" });

    worker.postMessage({ phase, code, ctx });
  });
}

/** Convenience: did every test pass (and no fatal error)? */
export function allPassed(o: ScriptOutcome): boolean {
  return o.ok && o.tests.every((t) => t.passed);
}
