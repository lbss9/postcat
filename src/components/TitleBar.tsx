import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Button from "./Button";

const isMac = /Mac/i.test(navigator.userAgent);

type MenuId = "file" | "edit" | "view" | "help";

export interface TitleBarProps {
  onNewRequest: () => void;
  onOpenSettings: (tab?: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleSidebar: () => void;
  onImport: () => void;
}

export default function TitleBar({
  onNewRequest,
  onOpenSettings,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleSidebar,
  onImport,
}: TitleBarProps) {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  // getCurrentWindow throws when the Tauri runtime isn't present (e.g. the app
  // loaded in a plain browser); stay resilient rather than white-screening
  const win = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!win) return;
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized);
    win
      .onResized(() => win.isMaximized().then(setMaximized))
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [win]);

  // close the menu on outside click / Escape
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const controls = (
    <div className={`win-controls ${isMac ? "mac" : "win"}`}>
      {isMac ? (
        <>
          <Button variant="bare" className="wc mac close" onClick={() => win?.close()} aria-label="close" />
          <Button variant="bare" className="wc mac min" onClick={() => win?.minimize()} aria-label="minimize" />
          <Button variant="bare" className="wc mac max" onClick={() => win?.toggleMaximize()} aria-label="maximize" />
        </>
      ) : (
        <>
          <Button variant="bare" className="wc win min" onClick={() => win?.minimize()} aria-label="minimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4.5" width="10" height="1" fill="currentColor" /></svg>
          </Button>
          <Button variant="bare" className="wc win max" onClick={() => win?.toggleMaximize()} aria-label="maximize">
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" /><path d="M3 2.5V1h5.5V6.5H7" fill="none" stroke="currentColor" /></svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" /></svg>
            )}
          </Button>
          <Button variant="bare" className="wc win close" onClick={() => win?.close()} aria-label="close">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" /></svg>
          </Button>
        </>
      )}
    </div>
  );

  const exec = (cmd: string) => () => {
    try {
      document.execCommand(cmd);
    } catch {
      /* editing command unavailable */
    }
  };

  const menus: { id: MenuId; label: string; items: MenuItem[] }[] = [
    {
      id: "file",
      label: t("menu.file"),
      items: [
        { label: t("menu.newRequest"), shortcut: "Ctrl+T", action: onNewRequest },
        { sep: true },
        { label: t("menu.import"), shortcut: "Ctrl+O", action: onImport },
        { sep: true },
        { label: t("menu.settings"), shortcut: "Ctrl+,", action: () => onOpenSettings("general") },
        { sep: true },
        { label: t("menu.exit"), action: () => win?.close() },
      ],
    },
    {
      id: "edit",
      label: t("menu.edit"),
      items: [
        { label: t("menu.undo"), shortcut: "Ctrl+Z", action: exec("undo") },
        { label: t("menu.redo"), shortcut: "Ctrl+Y", action: exec("redo") },
        { sep: true },
        { label: t("menu.cut"), shortcut: "Ctrl+X", action: exec("cut") },
        { label: t("menu.copy"), shortcut: "Ctrl+C", action: exec("copy") },
        { label: t("menu.paste"), shortcut: "Ctrl+V", action: exec("paste") },
        { sep: true },
        { label: t("menu.selectAll"), shortcut: "Ctrl+A", action: exec("selectAll") },
      ],
    },
    {
      id: "view",
      label: t("menu.view"),
      items: [
        { label: t("menu.zoomIn"), shortcut: "Ctrl++", action: onZoomIn },
        { label: t("menu.zoomOut"), shortcut: "Ctrl+-", action: onZoomOut },
        { label: t("menu.zoomReset"), shortcut: "Ctrl+0", action: onZoomReset },
        { sep: true },
        { label: t("menu.toggleSidebar"), shortcut: "Ctrl+B", action: onToggleSidebar },
      ],
    },
    {
      id: "help",
      label: t("menu.help"),
      items: [{ label: t("menu.about"), action: () => onOpenSettings("about") }],
    },
  ];

  return (
    <>
      <ResizeHandles />
      <header className="titlebar" data-tauri-drag-region>
        {isMac && controls}
        <div className="tb-brand" data-tauri-drag-region>
          <span className="tb-glyph">P</span>
          <span className="tb-name">PostCat</span>
        </div>
        <nav className="menubar">
          {menus.map((m) => (
            <div className="menu-root" key={m.id}>
              <Button
                variant="bare"
                className={`menu-trigger ${openMenu === m.id ? "open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(openMenu === m.id ? null : m.id);
                }}
                onMouseEnter={() => openMenu && setOpenMenu(m.id)}
              >
                {m.label}
              </Button>
              {openMenu === m.id && (
                <div className="menu-pop" onClick={(e) => e.stopPropagation()}>
                  {m.items.map((it, i) =>
                    it.sep ? (
                      <div className="menu-sep" key={i} />
                    ) : (
                      <Button
                        variant="bare"
                        className="menu-item"
                        key={i}
                        onClick={() => {
                          it.action?.();
                          setOpenMenu(null);
                        }}
                      >
                        <span>{it.label}</span>
                        {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
                      </Button>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="tb-drag" data-tauri-drag-region />
        {!isMac && controls}
      </header>
    </>
  );
}

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  sep?: boolean;
}

/* thin edge/corner grips that let a frameless window be resized */
function ResizeHandles() {
  const win = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);
  const dirs = [
    "North",
    "South",
    "East",
    "West",
    "NorthEast",
    "NorthWest",
    "SouthEast",
    "SouthWest",
  ] as const;
  const startedRef = useRef(false);
  return (
    <>
      {dirs.map((d) => (
        <div
          key={d}
          className={`resize-grip rz-${d.toLowerCase()}`}
          onMouseDown={(e) => {
            if (e.button !== 0 || startedRef.current) return;
            startedRef.current = true;
            // ResizeDirection is a string union in the Tauri 2 JS API
            win
              ?.startResizeDragging(d as never)
              .finally(() => (startedRef.current = false));
          }}
        />
      ))}
    </>
  );
}
