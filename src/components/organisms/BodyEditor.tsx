import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Dropdown from "@/components/molecules/Dropdown";
import ToolButton from "@/components/molecules/ToolButton";
import CodeEditor from "@/components/organisms/CodeEditor";
import { usePersistedBool, WRAP_KEYS } from "@/hooks/usePersistedBool";
import FormDataTable from "@/components/organisms/FormDataTable";
import KeyValTable from "@/components/organisms/KeyValTable";
import { RAW_LANGS, type BodyType, type RawLang, type RequestState } from "@/types";
import { baseName, pickFile } from "@/utils/file";

/** Request body editor: type chips + the editor for the selected body type. */
export default function BodyEditor({
  req,
  onPatch,
  vars,
  onSetVar,
  envName,
  indentUnit = "  ",
  indentJson = 2,
}: {
  req: RequestState;
  onPatch: (p: Partial<RequestState>) => void;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
  indentUnit?: string;
  indentJson?: string | number;
}) {
  const { t } = useTranslation();
  const varProps = { vars, onSetVar, envName };
  const types: BodyType[] = ["none", "form-data", "urlencoded", "raw", "binary"];
  // per-area preference: applies to every raw body editor, current and new
  const [wrap, toggleWrap] = usePersistedBool(WRAP_KEYS.raw);

  function beautify() {
    try {
      onPatch({ raw: JSON.stringify(JSON.parse(req.raw), null, indentJson) });
    } catch {
      /* not valid JSON */
    }
  }

  return (
    <div className="body-editor">
      <div className="body-toolbar">
        <div className="body-types">
          {types.map((id) => (
            <Button
              variant="bare"
              key={id}
              className={`chip ${req.bodyType === id ? "active" : ""}`}
              onClick={() => onPatch({ bodyType: id })}
            >
              {t(`body.${id === "form-data" ? "formData" : id === "urlencoded" ? "urlencoded" : id}`)}
            </Button>
          ))}
        </div>
        {req.bodyType === "raw" && (
          <div className="body-raw-tools">
            <ToolButton icon="wrap" title={t("editor.wrap")} active={wrap} onClick={toggleWrap} />
            <Dropdown
              className="rawlang-dd"
              value={req.rawLang}
              menuAlign="right"
              options={RAW_LANGS.map((l) => ({ value: l, label: t(`rawLang.${l}`) }))}
              onChange={(v) => onPatch({ rawLang: v as RawLang })}
            />
            {req.rawLang === "json" && (
              <Button variant="bare" className="beautify" onClick={beautify}>
                {t("actions.beautify")}
              </Button>
            )}
          </div>
        )}
      </div>

      {req.bodyType === "none" && <p className="body-none">{t("body.noBody")}</p>}

      {req.bodyType === "raw" && (
        <div className="body-raw">
          <CodeEditor
            key={`${req.rawLang}-${indentUnit}`}
            language={req.rawLang}
            indent={indentUnit}
            wrap={wrap}
            value={req.raw}
            placeholder={
              req.rawLang === "json" ? t("body.jsonPlaceholder") : t("body.textPlaceholder")
            }
            onChange={(v) => onPatch({ raw: v })}
          />
        </div>
      )}

      {req.bodyType === "urlencoded" && (
        <KeyValTable
          rows={req.urlencoded}
          onChange={(urlencoded) => onPatch({ urlencoded })}
          keyPlaceholder={t("side.varKey")}
          {...varProps}
        />
      )}

      {req.bodyType === "form-data" && (
        <FormDataTable
          rows={req.formData}
          onChange={(formData) => onPatch({ formData })}
          {...varProps}
        />
      )}

      {req.bodyType === "binary" && (
        <div className="binary-picker">
          <Button
            variant="bare"
            className="opt-chip"
            onClick={() => pickFile((p) => onPatch({ binaryPath: p }))}
          >
            {t("body.selectFile")}
          </Button>
          {req.binaryPath && (
            <span className="binary-path mono" title={req.binaryPath}>
              {baseName(req.binaryPath)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
