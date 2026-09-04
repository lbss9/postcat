import { useMemo, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import Tab from "@/components/atoms/Tab";
import ToolButton from "@/components/molecules/ToolButton";
import CodeEditor, { type CodeEditorHandle } from "@/components/organisms/CodeEditor";
import { usePersistedBool, WRAP_KEYS } from "@/hooks/usePersistedBool";
import type { ScriptOutcome } from "@/scripting/runner";
import type { SendResult } from "@/types";
import type { ResTab } from "@/types/workspace";
import { escapeHtml, formatBytes, looksJson, statusClass } from "@/utils/format";

/** Response viewer: status/timing header, body (pretty/raw), headers and test results. */
export default function ResponsePanel({
  res,
  error,
  loading,
  tab,
  onTab,
  script,
  indentJson = 2,
}: {
  res: SendResult | null;
  error: string | null;
  loading: boolean;
  tab: ResTab;
  onTab: (t: ResTab) => void;
  script: ScriptOutcome | null;
  indentJson?: string | number;
}) {
  const { t } = useTranslation();
  const jsonRef = useRef<CodeEditorHandle>(null);
  // one global preference — wrapping applies to every response body
  const [wrap, toggleWrap] = usePersistedBool(WRAP_KEYS.response);
  const passed = script ? script.tests.filter((x) => x.passed).length : 0;
  const failed = script ? script.tests.length - passed : 0;
  const hasTestTab = !!script && (script.tests.length > 0 || !script.ok || script.logs.length > 0);

  const pretty = useMemo(() => {
    if (!res) return "";
    const ct = res.contentType.toLowerCase();
    if (ct.includes("json") || looksJson(res.body)) {
      try {
        return JSON.stringify(JSON.parse(res.body), null, indentJson);
      } catch {
        return res.body;
      }
    }
    return res.body;
  }, [res, indentJson]);

  const isJson = res
    ? res.contentType.toLowerCase().includes("json") || looksJson(res.body)
    : false;

  return (
    <div className="res-panel">
      <div className="res-head">
        <span className="res-title">{t("response.title")}</span>
        {res && (
          <div className="res-meta">
            <span className={`res-status ${statusClass(res.status)}`}>
              {res.status} {res.statusText}
            </span>
            <span className="res-metric">
              <b>{res.timeMs}</b> ms
            </span>
            <span className="res-metric">
              <b>{formatBytes(res.sizeBytes)}</b>
            </span>
          </div>
        )}
      </div>

      <div className="res-body">
        {loading && (
          <div className="res-placeholder">
            <span className="spinner big" />
            <p>{t("actions.sending")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="res-placeholder error">
            <span className="err-glyph">!</span>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !res && (
          <div className="res-placeholder">
            <p className="hint">
              <Trans i18nKey="response.hint" components={{ b: <b />, k: <kbd /> }} />
            </p>
          </div>
        )}

        {!loading && !error && res && (
          <>
            <nav className="tabs sub">
              <Tab active={tab === "pretty"} onClick={() => onTab("pretty")}>
                {isJson ? t("response.pretty") : t("response.body")}
              </Tab>
              <Tab active={tab === "raw"} onClick={() => onTab("raw")}>
                {t("response.raw")}
              </Tab>
              <Tab active={tab === "headers"} onClick={() => onTab("headers")}>
                {t("response.headers")} <b className="count">{res.headers.length}</b>
              </Tab>
              {hasTestTab && (
                <Tab active={tab === "tests"} onClick={() => onTab("tests")}>
                  {t("response.tests")}{" "}
                  {failed > 0 ? (
                    <b className="count fail">{failed}✕</b>
                  ) : (
                    script!.tests.length > 0 && <b className="count pass">{passed}✓</b>
                  )}
                </Tab>
              )}
              {(tab === "pretty" || tab === "raw") && (
                <div className="res-tools">
                  {tab === "pretty" && isJson && (
                    <>
                      <ToolButton
                        icon="fold-all"
                        title={t("editor.foldAll")}
                        onClick={() => jsonRef.current?.foldAll()}
                      />
                      <ToolButton
                        icon="unfold-all"
                        title={t("editor.unfoldAll")}
                        onClick={() => jsonRef.current?.unfoldAll()}
                      />
                    </>
                  )}
                  <ToolButton icon="wrap" title={t("editor.wrap")} active={wrap} onClick={toggleWrap} />
                </div>
              )}
            </nav>
            <div className={`res-content${tab === "pretty" && isJson ? " editor" : ""}`}>
              {tab === "pretty" && isJson && (
                <div className="res-editor">
                  <CodeEditor
                    ref={jsonRef}
                    language="json"
                    readOnly
                    foldable
                    wrap={wrap}
                    value={pretty}
                    onChange={() => {}}
                  />
                </div>
              )}
              {tab === "pretty" && !isJson && (
                <pre
                  className={`code mono${wrap ? " wrap" : ""}`}
                  dangerouslySetInnerHTML={{ __html: escapeHtml(pretty) }}
                />
              )}
              {tab === "raw" && (
                <pre className={`code mono${wrap ? " wrap" : ""}`}>{res.body}</pre>
              )}
              {tab === "headers" && (
                <div className="res-headers">
                  {res.headers.map(([k, v], i) => (
                    <div className="res-header-row" key={i}>
                      <span className="rh-key">{k}</span>
                      <span className="rh-val">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === "tests" && script && (
                <div className="res-tests">
                  {script.tests.length > 0 && (
                    <div className="test-summary">
                      {passed > 0 && <span className="ts-pass">{passed} {t("response.testsPassed")}</span>}
                      {failed > 0 && <span className="ts-fail">{failed} {t("response.testsFailed")}</span>}
                    </div>
                  )}
                  {script.tests.map((tr, i) => (
                    <div className={`test-row ${tr.passed ? "pass" : "fail"}`} key={i}>
                      <span className="test-mark">{tr.passed ? "✓" : "✕"}</span>
                      <span className="test-name">{tr.name}</span>
                      {!tr.passed && tr.error && <span className="test-err">{tr.error}</span>}
                    </div>
                  ))}
                  {!script.ok && script.error && (
                    <div className="test-fatal">
                      <span className="test-mark">!</span>
                      <span>{script.error}</span>
                    </div>
                  )}
                  {script.logs.length > 0 && (
                    <div className="test-logs">
                      <div className="test-logs-head">{t("response.logs")}</div>
                      {script.logs.map((l, i) => (
                        <div className={`log-line ${l.level}`} key={i}>
                          {l.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
