import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Dropdown from "@/components/molecules/Dropdown";
import MethodSelect from "@/components/molecules/MethodSelect";
import VarInput from "@/components/molecules/VarInput";
import type { Environment, Method } from "@/types";

/** Method + URL + environment picker + Send, in one row. */
export default function UrlBar({
  method,
  url,
  loading,
  onMethod,
  onUrl,
  onSend,
  vars,
  onSetVar,
  envName,
  environments,
  activeEnvId,
  onSelectEnv,
}: {
  method: Method;
  url: string;
  loading: boolean;
  onMethod: (m: Method) => void;
  onUrl: (url: string) => void;
  onSend: () => void;
  vars: Record<string, string>;
  onSetVar: (name: string, value: string) => void;
  envName: string | null;
  environments: Environment[];
  activeEnvId: string;
  onSelectEnv: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="urlbar">
      <MethodSelect value={method} onChange={onMethod} />
      <VarInput
        value={url}
        placeholder={t("url.placeholder")}
        onChange={onUrl}
        onEnter={onSend}
        vars={vars}
        onSetVar={onSetVar}
        envName={envName}
      />
      <Dropdown
        className="env-dd"
        value={activeEnvId}
        menuAlign="right"
        ariaLabel={t("side.environments")}
        options={[
          { value: "", label: t("side.noEnv") },
          ...environments.map((e) => ({ value: e.id, label: e.name })),
        ]}
        onChange={onSelectEnv}
      />
      <Button
        variant="bare"
        className="send-btn"
        onClick={onSend}
        disabled={loading || !url.trim()}
      >
        {loading ? <span className="spinner" /> : t("actions.send")}
      </Button>
    </div>
  );
}
