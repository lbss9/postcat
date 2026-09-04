import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import type { RequestState } from "@/types";
import { computeAutoHeaders, overriddenKeys } from "@/utils/autoHeaders";

/**
 * Read-only preview of the headers the HTTP engine adds by itself, with a
 * show/hide toggle (persisted). Headers the user overrides manually are shown
 * struck through.
 */
export default function AutoHeaders({ req }: { req: RequestState }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem("postcat-auto-headers") === "1";
    } catch {
      return false;
    }
  });
  const headers = computeAutoHeaders(req);
  const overridden = overriddenKeys(req);

  function toggle() {
    setShow((s) => {
      const next = !s;
      try {
        localStorage.setItem("postcat-auto-headers", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  return (
    <div className="auto-headers">
      <Button variant="bare" className="auto-headers-toggle" onClick={toggle}>
        <Icon name="chevron" size={13} className={`ah-caret ${show ? "open" : ""}`} />
        <span>{show ? t("headers.hideAuto") : t("headers.showAuto")}</span>
        <span className="ah-count">{headers.length}</span>
      </Button>
      {show && (
        <div className="auto-headers-list">
          {headers.map((h) => {
            const isOverridden = overridden.has(h.key.toLowerCase());
            return (
              <div className={`ah-row ${isOverridden ? "overridden" : ""}`} key={h.key}>
                <span className="ah-key">{h.key}</span>
                <span className={`ah-val ${h.computed ? "computed" : ""}`}>
                  {h.computed ? t("headers.computed") : h.value}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
