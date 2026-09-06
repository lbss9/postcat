import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import appIcon from "@/assets/icon.png";
import { checkForUpdates, installUpdate, useUpdater } from "@/services/updater";
import Button from "@/components/atoms/Button";
import Icon from "@/components/atoms/Icon";
import ToggleRow from "@/components/molecules/ToggleRow";
import { LANGUAGES } from "@/i18n";
import { useNetworkPrefs, type NetworkPrefs } from "@/hooks/useNetworkPrefs";
import { AUTO_ID } from "@/hooks/useTheme";
import {
  DEFAULT_EDITOR_SIZE,
  DEFAULT_INDENT,
  DEFAULT_MONO,
  DEFAULT_SANS,
  DEFAULT_UI_SIZE,
  type FontOverride,
  type Theme,
} from "@/theme/themes";

export type SettingsTab =
  | "general"
  | "appearance"
  | "network"
  | "shortcuts"
  | "data"
  | "about";

const TABS: SettingsTab[] = [
  "general",
  "appearance",
  "network",
  "shortcuts",
  "data",
  "about",
];

const SWATCH_KEYS = ["accent", "bg", "panel", "get", "post", "put", "delete"];

export const APP_VERSION = "0.1.0";

export interface SettingsDialogProps {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  themes: Theme[];
  currentThemeId: string;
  onSelectTheme: (id: string) => void;
  fonts: FontOverride;
  onFonts: (f: FontOverride) => void;
  onOpenThemesFolder: () => void;
  // general
  twoPane: boolean;
  onToggleTwoPane: () => void;
  confirmClose: boolean;
  onToggleConfirmClose: () => void;
  saveHistory: boolean;
  onToggleSaveHistory: () => void;
  // data
  onImport: () => void;
  onClearHistory: () => void;
  onOpenDataFolder: () => void;
  onResetLayout: () => void;
}

export default function SettingsDialog(props: SettingsDialogProps) {
  const { open, tab, onTab, onClose } = props;
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>{t("settings.title")}</h2>
          <Button variant="bare" className="settings-close" onClick={onClose} aria-label="close">
            <Icon name="x" size={16} />
          </Button>
        </div>
        <div className="settings-body">
          <nav className="settings-rail">
            {TABS.map((id) => (
              <Button
                variant="bare"
                key={id}
                className={`settings-tab ${tab === id ? "active" : ""}`}
                onClick={() => onTab(id)}
              >
                {t(`settings.tabs.${id}`)}
              </Button>
            ))}
          </nav>

          <div className="settings-content">
            {tab === "general" && <General {...props} />}
            {tab === "appearance" && <Appearance {...props} />}
            {tab === "network" && <Network />}
            {tab === "shortcuts" && <Shortcuts />}
            {tab === "data" && <Data {...props} />}
            {tab === "about" && <About {...props} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- General --------------------------------- */

function General({
  confirmClose,
  onToggleConfirmClose,
  saveHistory,
  onToggleSaveHistory,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <>
      <Section title={t("settings.general.tabs")}>
        <ToggleRow
          label={t("settings.general.confirmClose")}
          desc={t("settings.general.confirmCloseDesc")}
          checked={confirmClose}
          onChange={onToggleConfirmClose}
        />
      </Section>
      <Section title={t("settings.general.history")}>
        <ToggleRow
          label={t("settings.general.saveHistory")}
          desc={t("settings.general.saveHistoryDesc")}
          checked={saveHistory}
          onChange={onToggleSaveHistory}
        />
      </Section>
    </>
  );
}

/* --------------------------------- Network --------------------------------- */

const HTTP_VERSIONS: NetworkPrefs["httpVersion"][] = ["auto", "http1", "http2"];

function Network() {
  const { t } = useTranslation();
  const [net, patch, reset] = useNetworkPrefs();
  return (
    <>
      <Section title={t("settings.network.requests")}>
        <div className="font-grid">
          <div className="font-field">
            <label>{t("settings.network.timeout")}</label>
            <input
              className="font-input"
              type="number"
              min={0}
              max={600000}
              step={1000}
              value={net.timeoutMs}
              onChange={(e) => patch({ timeoutMs: clampInt(e.target.value, 0, 600000) })}
            />
          </div>
          <div className="font-field">
            <label>{t("settings.network.maxSize")}</label>
            <input
              className="font-input"
              type="number"
              min={1}
              max={1024}
              value={net.maxResponseMb}
              onChange={(e) => patch({ maxResponseMb: clampInt(e.target.value, 1, 1024) })}
            />
          </div>
        </div>
        <p className="settings-hint">{t("settings.network.timeoutHint")}</p>
      </Section>

      <Section title={t("settings.network.security")}>
        <ToggleRow
          label={t("settings.network.verifySsl")}
          desc={t("settings.network.verifySslDesc")}
          checked={net.verifySsl}
          onChange={() => patch({ verifySsl: !net.verifySsl })}
        />
        <ToggleRow
          label={t("settings.network.redirects")}
          desc={t("settings.network.redirectsDesc")}
          checked={net.followRedirects}
          onChange={() => patch({ followRedirects: !net.followRedirects })}
        />
        <ToggleRow
          label={t("settings.network.cookies")}
          desc={t("settings.network.cookiesDesc")}
          checked={!net.disableCookies}
          onChange={() => patch({ disableCookies: !net.disableCookies })}
        />
      </Section>

      <Section title={t("settings.network.protocol")}>
        <div className="indent-seg">
          {HTTP_VERSIONS.map((v) => (
            <Button
              variant="bare"
              key={v}
              className={`seg-btn ${net.httpVersion === v ? "active" : ""}`}
              onClick={() => patch({ httpVersion: v })}
            >
              {t(`settings.network.${v}`)}
            </Button>
          ))}
        </div>
        <p className="settings-hint">{t("settings.network.protocolHint")}</p>
      </Section>

      <div className="font-actions">
        <Button variant="bare" className="opt-chip" onClick={reset}>
          {t("settings.network.reset")}
        </Button>
        <span className="settings-hint" style={{ margin: 0 }}>
          {t("settings.network.applyHint")}
        </span>
      </div>
    </>
  );
}

/* -------------------------------- Shortcuts -------------------------------- */

const APP_SHORTCUTS: [string, string][] = [
  ["send", "Ctrl+Enter"],
  ["newTab", "Ctrl+T"],
  ["closeTab", "Ctrl+W"],
  ["save", "Ctrl+S"],
  ["import", "Ctrl+O"],
  ["settings", "Ctrl+,"],
  ["sidebar", "Ctrl+B"],
  ["zoomIn", "Ctrl+="],
  ["zoomOut", "Ctrl+-"],
  ["zoomReset", "Ctrl+0"],
];

const EDITOR_SHORTCUTS: [string, string][] = [
  ["autocomplete", "Ctrl+Space"],
  ["indent", "Tab"],
  ["fold", "Ctrl+Shift+["],
  ["unfold", "Ctrl+Shift+]"],
  ["foldAll", "Ctrl+Alt+["],
  ["unfoldAll", "Ctrl+Alt+]"],
];

function Shortcuts() {
  const { t } = useTranslation();
  const list = (items: [string, string][]) => (
    <div className="shortcut-list">
      {items.map(([key, combo]) => (
        <div className="shortcut-row" key={key}>
          <span className="shortcut-label">{t(`settings.shortcuts.${key}`)}</span>
          <span className="shortcut-keys">
            {combo.split("+").map((k, i) => (
              <kbd key={i}>{k}</kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Section title={t("settings.shortcuts.app")}>{list(APP_SHORTCUTS)}</Section>
      <Section title={t("settings.shortcuts.editor")}>{list(EDITOR_SHORTCUTS)}</Section>
    </>
  );
}

/* ----------------------------------- Data ---------------------------------- */

function Data({ onImport, onClearHistory, onOpenDataFolder, onResetLayout }: SettingsDialogProps) {
  const { t } = useTranslation();
  return (
    <>
      <Section title={t("settings.data.storage")}>
        <ActionRow
          label={t("settings.data.folder")}
          desc={t("settings.data.folderDesc")}
          action={t("settings.data.openFolder")}
          onClick={onOpenDataFolder}
        />
      </Section>
      <Section title={t("settings.data.importTitle")}>
        <ActionRow
          label={t("settings.data.import")}
          desc={t("settings.data.importDesc")}
          action={t("settings.data.importBtn")}
          onClick={onImport}
        />
      </Section>
      <Section title={t("settings.data.cleanup")}>
        <ActionRow
          label={t("settings.data.clearHistory")}
          desc={t("settings.data.clearHistoryDesc")}
          action={t("settings.data.clearBtn")}
          danger
          onClick={onClearHistory}
        />
        <ActionRow
          label={t("settings.data.resetLayout")}
          desc={t("settings.data.resetLayoutDesc")}
          action={t("settings.data.resetBtn")}
          onClick={onResetLayout}
        />
      </Section>
    </>
  );
}

function ActionRow({
  label,
  desc,
  action,
  danger = false,
  onClick,
}: {
  label: string;
  desc: string;
  action: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        <span className="toggle-desc">{desc}</span>
      </div>
      <Button variant="bare" className={`opt-chip${danger ? " danger" : ""}`} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

/* ------------------------------- Appearance -------------------------------- */

function Appearance({
  themes,
  currentThemeId,
  onSelectTheme,
  fonts,
  onFonts,
  onOpenThemesFolder,
  twoPane,
  onToggleTwoPane,
}: SettingsDialogProps) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <Section title={t("settings.appearance.layout")}>
        <ToggleRow
          label={t("settings.appearance.twoPane")}
          desc={t("settings.appearance.twoPaneDesc")}
          checked={twoPane}
          onChange={onToggleTwoPane}
        />
      </Section>

      <Section title={t("settings.appearance.theme")}>
        <div className="theme-grid">
          <Button
            variant="bare"
            className={`theme-card ${currentThemeId === AUTO_ID ? "active" : ""}`}
            onClick={() => onSelectTheme(AUTO_ID)}
          >
            <div className="theme-auto-glyph">◐</div>
            <div className="theme-meta">
              <span className="theme-name">{t("settings.appearance.auto")}</span>
              <span className="theme-type">{t("settings.appearance.autoDesc")}</span>
            </div>
          </Button>

          {themes.map((th) => (
            <Button
              variant="bare"
              key={th.id}
              className={`theme-card ${currentThemeId === th.id ? "active" : ""}`}
              onClick={() => onSelectTheme(th.id)}
            >
              <div className="theme-swatches">
                {SWATCH_KEYS.map((k) => (
                  <span
                    key={k}
                    className="swatch"
                    style={{ background: th.colors[k] ?? "transparent" }}
                  />
                ))}
              </div>
              <div className="theme-meta">
                <span className="theme-name">{th.name}</span>
                <span className="theme-type">
                  {th.__source === "user" ? t("settings.appearance.userTheme") : th.type}
                </span>
              </div>
            </Button>
          ))}
        </div>
        <div className="opt-row" style={{ marginTop: 14 }}>
          <Button variant="bare" className="opt-chip" onClick={onOpenThemesFolder}>
            {t("settings.appearance.openFolder")}
          </Button>
        </div>
        <p className="settings-hint">{t("settings.appearance.themeHint")}</p>
      </Section>

      <Section title={t("settings.appearance.language")}>
        <div className="opt-row">
          {LANGUAGES.map((l) => (
            <Button
              variant="bare"
              key={l.code}
              className={`opt-chip ${i18n.language === l.code ? "active" : ""}`}
              onClick={() => i18n.changeLanguage(l.code)}
            >
              {l.name}
            </Button>
          ))}
        </div>
      </Section>

      <Section title={t("settings.appearance.fonts")}>
        <div className="font-grid">
          <div className="font-field">
            <label>{t("settings.appearance.fontSystem")}</label>
            <input
              className="font-input"
              spellCheck={false}
              value={fonts.systemFamily ?? DEFAULT_SANS}
              onChange={(e) =>
                onFonts({ ...fonts, systemFamily: e.target.value || undefined })
              }
            />
          </div>
          <div className="font-field size">
            <label>{t("settings.appearance.fontSize")}</label>
            <input
              className="font-input"
              type="number"
              min={10}
              max={22}
              value={fonts.systemSize ?? DEFAULT_UI_SIZE}
              onChange={(e) =>
                onFonts({ ...fonts, systemSize: parseSize(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="font-grid">
          <div className="font-field">
            <label>{t("settings.appearance.fontEditor")}</label>
            <input
              className="font-input mono"
              spellCheck={false}
              value={fonts.editorFamily ?? DEFAULT_MONO}
              onChange={(e) =>
                onFonts({ ...fonts, editorFamily: e.target.value || undefined })
              }
            />
          </div>
          <div className="font-field size">
            <label>{t("settings.appearance.fontSize")}</label>
            <input
              className="font-input"
              type="number"
              min={10}
              max={22}
              value={fonts.editorSize ?? DEFAULT_EDITOR_SIZE}
              onChange={(e) =>
                onFonts({ ...fonts, editorSize: parseSize(e.target.value) })
              }
            />
          </div>
        </div>
        <div className="indent-field">
          <label>{t("settings.appearance.indent")}</label>
          <div className="indent-controls">
            <input
              className="font-input indent-count"
              type="number"
              min={1}
              max={8}
              value={fonts.indentCount ?? DEFAULT_INDENT}
              onChange={(e) => onFonts({ ...fonts, indentCount: parseIndent(e.target.value) })}
            />
            <div className="indent-seg">
              <Button
                variant="bare"
                className={`seg-btn ${(fonts.indentType ?? "space") === "space" ? "active" : ""}`}
                onClick={() => onFonts({ ...fonts, indentType: "space" })}
              >
                {t("settings.appearance.indentSpace")}
              </Button>
              <Button
                variant="bare"
                className={`seg-btn ${fonts.indentType === "tab" ? "active" : ""}`}
                onClick={() => onFonts({ ...fonts, indentType: "tab" })}
              >
                {t("settings.appearance.indentTab")}
              </Button>
            </div>
          </div>
        </div>
        <div className="font-actions">
          <Button variant="bare" className="opt-chip" onClick={() => onFonts({})}>
            {t("settings.appearance.fontReset")}
          </Button>
          <span className="settings-hint" style={{ margin: 0 }}>
            {t("settings.appearance.fontHint")}
          </span>
        </div>
      </Section>
    </>
  );
}

/* ---------------------------------- About ---------------------------------- */

const ABOUT_FACTS: [string, string][] = [
  ["shell", "Tauri 2 · WebView2"],
  ["engine", "Rust · reqwest · rustls"],
  ["storage", "SQLite (WAL)"],
  ["ui", "React · TypeScript · Vite"],
  ["editor", "CodeMirror 6"],
  ["scripts", "Web Worker sandbox"],
];

function About({ onOpenDataFolder, onOpenThemesFolder }: SettingsDialogProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(APP_VERSION);
  const upd = useUpdater();
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const busy =
    upd.status === "checking" || upd.status === "downloading" || upd.status === "installing";
  let updateLine: ReactNode = null;
  if (upd.status === "checking") updateLine = <span>{t("update.checking")}</span>;
  else if (upd.status === "upToDate") updateLine = <span className="ok">{t("update.upToDate")}</span>;
  else if (upd.status === "error") updateLine = <span className="err">{t("update.error")}</span>;
  else if (upd.status === "available")
    updateLine = (
      <>
        <span className="new">{t("update.found", { version: upd.version })}</span>
        <Button variant="primary" size="sm" onClick={() => void installUpdate()}>
          {t("update.install")}
        </Button>
      </>
    );
  else if (upd.status === "downloading")
    updateLine = (
      <span>
        {upd.progress != null
          ? t("update.downloadingPct", { pct: Math.round(upd.progress * 100) })
          : t("update.downloading")}
      </span>
    );
  else if (upd.status === "installing") updateLine = <span>{t("update.installing")}</span>;

  return (
    <div className="about">
      <div className="about-hero">
        <div className="about-glyph">
          <img src={appIcon} alt="" draggable={false} />
        </div>
        <div className="about-title">
          <h3>PostCat</h3>
          <span className="about-tagline">{t("settings.about.tagline")}</span>
        </div>
        <span className="about-ver">v{version}</span>
      </div>
      <div className="about-update">
        <Button
          variant="bare"
          className="opt-chip"
          disabled={busy}
          onClick={() => void checkForUpdates()}
        >
          {t("update.check")}
        </Button>
        {updateLine}
      </div>
      <p className="about-desc">{t("settings.about.desc")}</p>
      <div className="about-facts">
        {ABOUT_FACTS.map(([key, value]) => (
          <div className="about-fact" key={key}>
            <span className="af-label">{t(`settings.about.${key}`)}</span>
            <span className="af-value">{value}</span>
          </div>
        ))}
      </div>
      <div className="about-actions">
        <Button variant="bare" className="opt-chip" onClick={onOpenDataFolder}>
          {t("settings.about.openData")}
        </Button>
        <Button variant="bare" className="opt-chip" onClick={onOpenThemesFolder}>
          {t("settings.appearance.openFolder")}
        </Button>
      </div>
      <p className="about-foot">{t("settings.about.foot")}</p>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function parseSize(v: string): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(22, Math.max(10, Math.round(n)));
}

function parseIndent(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_INDENT;
  return Math.min(8, Math.max(1, Math.round(n)));
}

function clampInt(v: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  );
}
