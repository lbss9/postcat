/// <reference lib="webworker" />
/**
 * Sandbox worker. Runs the user's script with a `pc` API and captures the
 * resulting env changes, test results and logs. Runs in a Worker so there is no
 * DOM; the obvious escape-hatch globals are additionally shadowed before the
 * user code runs. This is isolation for a local dev tool, not a security border
 * against hostile code.
 */
import type {
  ScriptContext,
  ScriptOutcome,
  ScriptPhase,
  TestResult,
  LogLine,
  ScriptHeader,
} from "./runner";

interface InMessage {
  phase: ScriptPhase;
  code: string;
  ctx: ScriptContext;
}

/* ------------------------------ assertions ------------------------------ */

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Any)[k], (b as Any)[k]));
}

function show(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "object" && v !== null) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

/**
 * Minimal chai-like expectation. Language chains (`to`, `be`, `have`, `that`,
 * `is`, `and`) return the same object; `not` flips the sense; methods and
 * terminal getters throw on failure. e.g. `pc.expect(r.code).to.equal(200)`,
 * `pc.expect(x).to.be.a("string")`, `pc.expect(y).to.not.be.empty`.
 */
function makeExpect(actual: Any, negated = false): Any {
  const check = (pass: boolean, msg: string) => {
    if (pass === negated) throw new Error(negated ? `expected NOT — ${msg}` : msg);
  };
  const e: Any = {
    equal: (v: Any) => check(actual === v, `expected ${show(actual)} to equal ${show(v)}`),
    eql: (v: Any) => check(deepEqual(actual, v), `expected ${show(actual)} to deep-equal ${show(v)}`),
    above: (v: number) => check(actual > v, `expected ${show(actual)} to be above ${v}`),
    below: (v: number) => check(actual < v, `expected ${show(actual)} to be below ${v}`),
    a: (type: string) =>
      check(
        (Array.isArray(actual) ? "array" : typeof actual) === type,
        `expected ${show(actual)} to be a ${type}`,
      ),
    include: (v: Any) =>
      check(
        (typeof actual === "string" || Array.isArray(actual)) && (actual as Any).includes(v),
        `expected ${show(actual)} to include ${show(v)}`,
      ),
    property: (k: string) =>
      check(
        actual != null && Object.prototype.hasOwnProperty.call(actual, k),
        `expected object to have property ${show(k)}`,
      ),
    status: (n: number) => check(Number(actual) === n, `expected status ${show(actual)} to be ${n}`),
    match: (re: RegExp) => check(re.test(String(actual)), `expected ${show(actual)} to match ${re}`),
  };
  e.an = e.a;
  e.contain = e.include;
  e.equals = e.equal;

  const same = { get: () => e };
  Object.defineProperties(e, {
    to: same, be: same, been: same, is: same, have: same, has: same, that: same, and: same, which: same,
    not: { get: () => makeExpect(actual, !negated) },
    ok: { get: () => check(!!actual, `expected ${show(actual)} to be truthy`) },
    true: { get: () => check(actual === true, `expected ${show(actual)} to be true`) },
    false: { get: () => check(actual === false, `expected ${show(actual)} to be false`) },
    null: { get: () => check(actual === null, `expected ${show(actual)} to be null`) },
    undefined: { get: () => check(actual === undefined, `expected ${show(actual)} to be undefined`) },
    exist: { get: () => check(actual != null, `expected ${show(actual)} to exist`) },
    empty: {
      get: () =>
        check(
          actual == null ||
            ((typeof actual === "string" || Array.isArray(actual)) && actual.length === 0) ||
            (typeof actual === "object" && Object.keys(actual).length === 0),
          `expected ${show(actual)} to be empty`,
        ),
    },
  });
  return e;
}

/* ------------------------------- headers -------------------------------- */

function headerApi(list: ScriptHeader[]) {
  return {
    get: (k: string) => list.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value,
    has: (k: string) => list.some((h) => h.key.toLowerCase() === k.toLowerCase()),
    set: (k: string, v: string) => {
      const h = list.find((x) => x.key.toLowerCase() === k.toLowerCase());
      if (h) h.value = String(v);
      else list.push({ key: k, value: String(v) });
    },
    remove: (k: string) => {
      const i = list.findIndex((h) => h.key.toLowerCase() === k.toLowerCase());
      if (i >= 0) list.splice(i, 1);
    },
    all: () => list.map((h) => ({ ...h })),
  };
}

/* --------------------------------- run ---------------------------------- */

self.onmessage = (ev: MessageEvent<InMessage>) => {
  const { phase, code, ctx } = ev.data;
  const tests: TestResult[] = [];
  const logs: LogLine[] = [];
  const envSet: Record<string, string> = {};
  const envUnset: string[] = [];

  // working copy of the request (pre-script may mutate it)
  const reqHeaders: ScriptHeader[] = ctx.request.headers.map((h) => ({ ...h }));
  const req = {
    method: ctx.request.method,
    url: ctx.request.url,
    headers: headerApi(reqHeaders),
    body: ctx.request.body,
  };

  const envGet = (k: string) =>
    k in envSet ? envSet[k] : envUnset.includes(k) ? undefined : ctx.env[k];

  const resp = ctx.response;
  const responseApi = resp
    ? {
        code: resp.code,
        status: resp.status,
        time: resp.timeMs,
        size: resp.sizeBytes,
        responseTime: resp.timeMs,
        text: () => resp.body,
        json: () => JSON.parse(resp.body),
        headers: headerApi(resp.headers.map((h) => ({ ...h }))),
      }
    : undefined;

  const pcConsole = {
    log: (...a: Any[]) => logs.push({ level: "log", text: a.map(fmt).join(" ") }),
    warn: (...a: Any[]) => logs.push({ level: "warn", text: a.map(fmt).join(" ") }),
    error: (...a: Any[]) => logs.push({ level: "error", text: a.map(fmt).join(" ") }),
  };

  const envApi = {
    get: envGet,
    set: (k: string, v: Any) => {
      envSet[k] = String(v);
      const i = envUnset.indexOf(k);
      if (i >= 0) envUnset.splice(i, 1);
    },
    unset: (k: string) => {
      if (!envUnset.includes(k)) envUnset.push(k);
      delete envSet[k];
    },
    has: (k: string) => envGet(k) !== undefined,
  };

  const pc = {
    phase,
    environmentName: ctx.envName,
    env: envApi,
    variables: envApi, // alias
    request: req,
    response: responseApi,
    expect: (v: Any) => makeExpect(v),
    test: (name: string, fn: () => void) => {
      try {
        fn();
        tests.push({ name: String(name), passed: true });
      } catch (e) {
        tests.push({ name: String(name), passed: false, error: errMsg(e) });
      }
    },
    console: pcConsole,
  };

  let fatal: string | undefined;
  try {
    // shadow the obvious escape-hatch globals, then run in strict mode
    const shadow = [
      "self",
      "globalThis",
      "postMessage",
      "importScripts",
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "Worker",
      "indexedDB",
    ];
    const fn = new Function(
      "pc",
      "console",
      ...shadow,
      `"use strict";\n${code}`,
    );
    fn(pc, pcConsole, ...shadow.map(() => undefined));
  } catch (e) {
    fatal = errMsg(e);
  }

  const out: ScriptOutcome = {
    ok: !fatal,
    error: fatal,
    envSet,
    envUnset,
    tests,
    logs,
  };
  if (phase === "pre") {
    out.request = { method: req.method, url: req.url, headers: reqHeaders.map((h) => ({ ...h })) };
  }
  self.postMessage(out);
};

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
