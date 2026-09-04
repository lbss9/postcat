import type { ReactNode } from "react";
import Resizer from "@/components/atoms/Resizer";

/**
 * Page skeleton: title bar on top, then a grid with the sidebar (optional,
 * resizable) and the main area. Overlays (dialogs) render last so they stack
 * above everything.
 */
export default function WorkspaceLayout({
  titleBar,
  sidebar,
  sidebarOpen,
  sidebarWidth,
  onSidebarResizeStart,
  onSidebarResize,
  overlays,
  children,
}: {
  titleBar: ReactNode;
  sidebar: ReactNode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  onSidebarResizeStart: () => void;
  onSidebarResize: (delta: number) => void;
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="root">
      {titleBar}
      <div
        className={`app ${sidebarOpen ? "" : "no-sidebar"}`}
        style={{
          gridTemplateColumns: sidebarOpen ? `${sidebarWidth}px 6px 1fr` : "1fr",
        }}
      >
        {sidebarOpen && sidebar}
        {sidebarOpen && (
          <Resizer
            orientation="vertical"
            onStart={onSidebarResizeStart}
            onMove={onSidebarResize}
          />
        )}

        <main className="main">{children}</main>
      </div>

      {overlays}
    </div>
  );
}
