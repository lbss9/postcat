import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import type { EnvVar, Environment } from "@/types";

/** Full-area editor for one environment: name, active toggle and its variables. */
export default function EnvironmentEditor({
  env,
  onSave,
  onSetActive,
}: {
  env: Environment | null;
  onSave: (id: string, name: string, variables: EnvVar[]) => void;
  onSetActive: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(env?.name ?? "");
  const [vars, setVars] = useState<EnvVar[]>(env?.variables ?? []);

  if (!env) {
    return <div className="env-main-empty">{t("side.noEnvs")}</div>;
  }

  const rows = [...vars, { key: "", value: "", enabled: true }];
  function update(i: number, patch: Partial<EnvVar>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setVars(next.filter((r) => r.key || r.value));
  }
  function removeVar(i: number) {
    setVars(rows.filter((_, idx) => idx !== i).filter((r) => r.key || r.value));
  }

  return (
    <div className="env-main">
      <div className="env-main-head">
        <Button
          variant="bare"
          className={`env-radio ${env.isActive ? "on" : ""}`}
          title={t("side.setActive")}
          onClick={() => onSetActive(env.isActive ? "" : env.id)}
        />
        <input
          className="env-main-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("side.envName")}
        />
        {env.isActive && <span className="env-badge">{t("side.active")}</span>}
        <Button variant="bare" className="send-btn env-main-save" onClick={() => onSave(env.id, name.trim() || env.name, vars)}>
          {t("side.saveEnv")}
        </Button>
      </div>

      <div className="em-table">
        <div className="em-head">
          <span />
          <span>{t("side.varKey")}</span>
          <span>{t("side.varValue")}</span>
          <span />
        </div>
        {rows.map((v, i) => {
          const blank = i === rows.length - 1 && !v.key && !v.value;
          return (
            <div className={`em-row ${v.enabled ? "" : "off"}`} key={i}>
              <input
                type="checkbox"
                className="kv-check"
                checked={v.enabled}
                disabled={blank}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              <input
                className="em-input mono"
                placeholder={t("side.varKey")}
                value={v.key}
                spellCheck={false}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <input
                className="em-input mono"
                placeholder={t("side.varValue")}
                value={v.value}
                spellCheck={false}
                onChange={(e) => update(i, { value: e.target.value })}
              />
              <Button
                variant="bare"
                className="kv-del"
                tabIndex={-1}
                style={{ visibility: blank ? "hidden" : "visible" }}
                onClick={() => removeVar(i)}
              >
                <Icon name="x" size={13} />
              </Button>
            </div>
          );
        })}
      </div>
      <p className="env-hint">{t("side.envHint")}</p>
    </div>
  );
}
