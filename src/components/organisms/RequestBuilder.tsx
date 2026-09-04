import { useTranslation } from "react-i18next";
import Tab from "@/components/atoms/Tab";
import AutoHeaders from "@/components/molecules/AutoHeaders";
import BodyEditor from "@/components/organisms/BodyEditor";
import KeyValTable from "@/components/organisms/KeyValTable";
import ScriptEditor from "@/components/organisms/ScriptEditor";
import type { RequestState } from "@/types";
import type { ReqTab } from "@/types/workspace";

/** Variable-pill wiring shared by every value field. */
export interface VarProps {
  vars: Record<string, string>;
  onSetVar: (name: string, value: string) => void;
  envName: string | null;
}

/** The request builder: Params / Headers / Body / Scripts sub-tabs and their editors. */
export default function RequestBuilder({
  req,
  reqTab,
  onReqTab,
  onPatch,
  varProps,
  indentUnit,
  indentJson,
}: {
  req: RequestState;
  reqTab: ReqTab;
  onReqTab: (tab: ReqTab) => void;
  onPatch: (p: Partial<RequestState>) => void;
  varProps: VarProps;
  indentUnit: string;
  indentJson: string | number;
}) {
  const { t } = useTranslation();
  const activeParams = req.params.filter((p) => p.enabled && p.key).length;
  const activeHeaders = req.headers.filter((h) => h.enabled && h.key).length;

  return (
    <div className="req-panel">
      <nav className="tabs">
        <Tab active={reqTab === "params"} onClick={() => onReqTab("params")}>
          {t("reqTabs.params")}{" "}
          {activeParams > 0 && <b className="count">{activeParams}</b>}
        </Tab>
        <Tab active={reqTab === "headers"} onClick={() => onReqTab("headers")}>
          {t("reqTabs.headers")}{" "}
          {activeHeaders > 0 && <b className="count">{activeHeaders}</b>}
        </Tab>
        <Tab active={reqTab === "body"} onClick={() => onReqTab("body")}>
          {t("reqTabs.body")}{" "}
          {req.bodyType !== "none" && <b className="count dot-only">•</b>}
        </Tab>
        <Tab active={reqTab === "scripts"} onClick={() => onReqTab("scripts")}>
          {t("reqTabs.scripts")}{" "}
          {(req.preScript.trim() || req.postScript.trim()) && (
            <b className="count dot-only">•</b>
          )}
        </Tab>
      </nav>

      <div className="req-content">
        {reqTab === "params" && (
          <div className="params-sections">
            <div className="param-section-title">{t("params.query")}</div>
            <KeyValTable
              rows={req.params}
              onChange={(params) => onPatch({ params })}
              keyPlaceholder={t("kv.param")}
              {...varProps}
            />
            {req.pathVars.length > 0 && (
              <>
                <div className="param-section-title">{t("params.path")}</div>
                <KeyValTable
                  rows={req.pathVars}
                  onChange={(pathVars) => onPatch({ pathVars })}
                  keyPlaceholder="param"
                  fixed
                  {...varProps}
                />
              </>
            )}
          </div>
        )}
        {reqTab === "headers" && (
          <div className="headers-tab">
            <KeyValTable
              rows={req.headers}
              onChange={(headers) => onPatch({ headers })}
              keyPlaceholder={t("kv.header")}
              {...varProps}
            />
            <AutoHeaders req={req} />
          </div>
        )}
        {reqTab === "body" && (
          <BodyEditor
            req={req}
            onPatch={onPatch}
            indentUnit={indentUnit}
            indentJson={indentJson}
            {...varProps}
          />
        )}
        {reqTab === "scripts" && <ScriptEditor req={req} onPatch={onPatch} />}
      </div>
    </div>
  );
}
