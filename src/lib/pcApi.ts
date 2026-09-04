/**
 * Description of the `pc.*` scripting surface, used to drive editor
 * autocompletion (label + signature + docs) so scripts are discoverable.
 * Keep in sync with script.worker.ts.
 */
export interface ApiMember {
  label: string;
  kind: "method" | "property" | "variable";
  /** short signature / type, shown inline in the completion row */
  detail: string;
  /** longer description, shown in the side panel (VS Code-style hover) */
  info: string;
}

const header = (owner: string): ApiMember[] => [
  { label: "get", kind: "method", detail: "(name: string) => string | undefined", info: `Return a ${owner} header value (case-insensitive).` },
  { label: "has", kind: "method", detail: "(name: string) => boolean", info: `Whether a ${owner} header is present.` },
  { label: "set", kind: "method", detail: "(name: string, value: string) => void", info: `Add or replace a ${owner} header.` },
  { label: "remove", kind: "method", detail: "(name: string) => void", info: `Remove a ${owner} header.` },
  { label: "all", kind: "method", detail: "() => { key, value }[]", info: `Every ${owner} header as an array.` },
];

/** path (dotted, rooted at `pc`) -> the members available on it */
export const PC_API: Record<string, ApiMember[]> = {
  pc: [
    { label: "env", kind: "property", detail: "Environment", info: "Read and write variables of the active environment. Values set here persist and can be used as {{name}} in later requests." },
    { label: "variables", kind: "property", detail: "Environment", info: "Alias of pc.env." },
    { label: "request", kind: "property", detail: "Request", info: "The outgoing request. In a pre-send script you can mutate method, url and headers before it is sent." },
    { label: "response", kind: "property", detail: "Response", info: "The response that arrived. Available in post-send scripts." },
    { label: "test", kind: "method", detail: "(name: string, fn: () => void) => void", info: "Define a named test. It passes unless fn throws (e.g. a failed pc.expect). Results show in the response Tests tab." },
    { label: "expect", kind: "method", detail: "(value: any) => Expectation", info: "Chai-like assertion. Chain with .to / .be / .have and .not, then a matcher: .equal(y), .eql(y), .a('string'), .include(x), .property('k'), .above(n), .below(n), .match(/re/), or terminals .ok / .true / .null / .undefined / .exist / .empty." },
    { label: "console", kind: "property", detail: "Console", info: "Log to the response Tests panel (does not touch the browser console)." },
    { label: "environmentName", kind: "property", detail: "string | null", info: "Name of the active environment, or null." },
    { label: "phase", kind: "property", detail: '"pre" | "post"', info: "Which phase this script is running in." },
  ],
  "pc.env": [
    { label: "get", kind: "method", detail: "(name: string) => string | undefined", info: "Read a variable (reflecting changes made earlier in this run)." },
    { label: "set", kind: "method", detail: "(name: string, value: any) => void", info: "Create or update a variable in the active environment. Persists after the run." },
    { label: "unset", kind: "method", detail: "(name: string) => void", info: "Remove a variable from the active environment." },
    { label: "has", kind: "method", detail: "(name: string) => boolean", info: "Whether a variable is defined." },
  ],
  "pc.request": [
    { label: "method", kind: "property", detail: "string", info: "HTTP method — settable in a pre-send script." },
    { label: "url", kind: "property", detail: "string", info: "Request URL (still with {{vars}} unresolved) — settable in a pre-send script." },
    { label: "headers", kind: "property", detail: "Headers", info: "Request headers — get/set/remove before send." },
    { label: "body", kind: "property", detail: "string", info: "Raw request body text (read-only)." },
  ],
  "pc.response": [
    { label: "code", kind: "property", detail: "number", info: "HTTP status code, e.g. 200." },
    { label: "status", kind: "property", detail: "string", info: "HTTP status text, e.g. \"OK\"." },
    { label: "json", kind: "method", detail: "() => any", info: "Parse the response body as JSON (throws if it is not JSON)." },
    { label: "text", kind: "method", detail: "() => string", info: "The raw response body as text." },
    { label: "headers", kind: "property", detail: "Headers", info: "Response headers — get/has/all." },
    { label: "time", kind: "property", detail: "number", info: "Round-trip time in milliseconds." },
    { label: "size", kind: "property", detail: "number", info: "Response size in bytes." },
    { label: "responseTime", kind: "property", detail: "number", info: "Alias of time." },
  ],
  "pc.console": [
    { label: "log", kind: "method", detail: "(...args: any[]) => void", info: "Log a line to the Tests panel." },
    { label: "warn", kind: "method", detail: "(...args: any[]) => void", info: "Log a warning line." },
    { label: "error", kind: "method", detail: "(...args: any[]) => void", info: "Log an error line." },
  ],
  "pc.request.headers": header("request"),
  "pc.response.headers": header("response"),
};

// pc.variables mirrors pc.env
PC_API["pc.variables"] = PC_API["pc.env"];
