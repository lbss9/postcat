import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import ToolButton from "@/components/molecules/ToolButton";
import CodeEditor, { type CodeEditorHandle } from "@/components/organisms/CodeEditor";
import { usePersistedBool, WRAP_KEYS } from "@/hooks/usePersistedBool";
import type { RequestState } from "@/types";

/**
 * Pre-send / post-send script editor with snippet chips that insert code at
 * the caret. Scripts are stored on the request (`preScript` / `postScript`).
 */
export default function ScriptEditor({
  req,
  onPatch,
}: {
  req: RequestState;
  onPatch: (patch: Partial<RequestState>) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  const edRef = useRef<CodeEditorHandle>(null);
  // per-area preference: applies to every script editor, current and new
  const [wrap, toggleWrap] = usePersistedBool(WRAP_KEYS.scripts);
  const isPre = phase === "pre";
  const value = isPre ? req.preScript : req.postScript;
  const field: keyof RequestState = isPre ? "preScript" : "postScript";

  const snippets = isPre
    ? [
        { label: "pc.env.set", code: 'pc.env.set("token", "abc123");\n' },
        { label: "header", code: 'pc.request.headers.set("X-Trace", "1");\n' },
        { label: "log", code: "pc.console.log(pc.request.url);\n" },
      ]
    : [
        { label: "status 200", code: 'pc.test("status is 200", () => {\n  pc.expect(pc.response.code).to.equal(200);\n});\n' },
        { label: "json body", code: 'pc.test("has id", () => {\n  const data = pc.response.json();\n  pc.expect(data).to.have.property("id");\n});\n' },
        { label: "save token", code: 'pc.env.set("token", pc.response.json().token);\n' },
      ];

  function insert(code: string) {
    if (edRef.current) edRef.current.insert(code);
    else onPatch({ [field]: value + code } as Partial<RequestState>);
  }

  return (
    <div className="script-editor">
      <div className="script-head">
        <div className="script-switch">
          <Button
            variant="bare"
            className={`script-seg ${isPre ? "active" : ""} ${req.preScript.trim() ? "filled" : ""}`}
            onClick={() => setPhase("pre")}
          >
            {t("scripts.pre")}
          </Button>
          <Button
            variant="bare"
            className={`script-seg ${!isPre ? "active" : ""} ${req.postScript.trim() ? "filled" : ""}`}
            onClick={() => setPhase("post")}
          >
            {t("scripts.post")}
          </Button>
        </div>
        <div className="script-snippets">
          {snippets.map((s) => (
            <Button
              key={s.label}
              variant="bare"
              className="snippet-chip"
              title={t("scripts.insert")}
              onClick={() => insert(s.code)}
            >
              {s.label}
            </Button>
          ))}
          <ToolButton icon="wrap" title={t("editor.wrap")} active={wrap} onClick={toggleWrap} />
        </div>
      </div>
      <div className="script-area">
        <CodeEditor
          key={phase}
          ref={edRef}
          scripting
          wrap={wrap}
          value={value}
          placeholder={isPre ? t("scripts.prePlaceholder") : t("scripts.postPlaceholder")}
          onChange={(v) => onPatch({ [field]: v } as Partial<RequestState>)}
        />
      </div>
      <p className="script-hint">{t("scripts.hint")}</p>
    </div>
  );
}
