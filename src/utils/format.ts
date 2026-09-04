/** Presentation helpers for the response panel (status colouring, sizes, JSON). */

/** CSS modifier for an HTTP status class (2xx/3xx/4xx/5xx). */
export function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "s-2xx";
  if (status >= 300 && status < 400) return "s-3xx";
  if (status >= 400 && status < 500) return "s-4xx";
  if (status >= 500) return "s-5xx";
  return "s-0";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Cheap sniff: does the text start like a JSON object/array? */
export function looksJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal, dependency-free JSON syntax highlighter (emits `.j-*` spans). */
export function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "j-num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "j-key" : "j-str";
      } else if (/true|false/.test(match)) {
        cls = "j-bool";
      } else if (/null/.test(match)) {
        cls = "j-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
