import { useEffect, useRef, useState } from "react";

/**
 * Persisted workspace geometry: sidebar visibility/width, response pane size
 * (height when stacked, width in two-pane mode), two-pane toggle and zoom.
 * Every value round-trips through localStorage under a `postcat-*` key.
 */
export function useLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    () => Number(localStorage.getItem("postcat-sbw")) || 244,
  );
  const [responseHeight, setResponseHeight] = useState<number>(() => {
    const stored = Number(localStorage.getItem("postcat-resh"));
    const val = stored || Math.round(window.innerHeight * 0.42);
    // always keep at least ~400px for the request builder above
    return Math.max(140, Math.min(val, window.innerHeight - 400));
  });
  const baseSbw = useRef(sidebarWidth);
  const baseResh = useRef(responseHeight);
  const [zoom, setZoom] = useState<number>(
    () => Number(localStorage.getItem("postcat-zoom")) || 1,
  );

  function resizeSidebar(delta: number) {
    const w = Math.min(520, Math.max(190, baseSbw.current + delta));
    setSidebarWidth(w);
    localStorage.setItem("postcat-sbw", String(w));
  }
  function resizeResponse(delta: number) {
    // dragging the divider up (negative delta) makes the response taller
    const h = Math.min(window.innerHeight - 220, Math.max(120, baseResh.current - delta));
    setResponseHeight(h);
    localStorage.setItem("postcat-resh", String(h));
  }

  // two-pane: request on the left, response on the right (instead of stacked)
  const [twoPane, setTwoPane] = useState<boolean>(() => {
    try {
      return localStorage.getItem("postcat-two-pane") === "1";
    } catch {
      return false;
    }
  });
  function toggleTwoPane() {
    setTwoPane((v) => {
      const next = !v;
      try {
        localStorage.setItem("postcat-two-pane", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  const [responseWidth, setResponseWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem("postcat-resw")) || 480;
    // never wider than the window allows (it may have been saved on a bigger window)
    return Math.max(300, Math.min(stored, window.innerWidth - 460));
  });
  const baseResw = useRef(responseWidth);
  function resizeResponseWidth(delta: number) {
    // dragging the divider left (negative delta) makes the response wider
    const w = Math.min(window.innerWidth - 460, Math.max(300, baseResw.current - delta));
    setResponseWidth(w);
    localStorage.setItem("postcat-resw", String(w));
  }

  useEffect(() => {
    (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom =
      String(zoom);
    localStorage.setItem("postcat-zoom", String(zoom));
  }, [zoom]);

  const zoomIn = () => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)));
  const zoomReset = () => setZoom(1);

  /** back to the out-of-the-box geometry (Settings → Data → Reset layout) */
  function resetLayout() {
    for (const k of ["postcat-sbw", "postcat-resh", "postcat-resw"]) localStorage.removeItem(k);
    setSidebarOpen(true);
    setSidebarWidth(244);
    setResponseHeight(Math.max(140, Math.min(Math.round(window.innerHeight * 0.42), window.innerHeight - 400)));
    setResponseWidth(480);
    setZoom(1);
  }

  return {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen((s) => !s),
    sidebarWidth,
    startSidebarResize: () => (baseSbw.current = sidebarWidth),
    resizeSidebar,
    responseHeight,
    responseWidth,
    twoPane,
    toggleTwoPane,
    /** capture both bases; the active one depends on the pane mode */
    startResponseResize: () => {
      baseResh.current = responseHeight;
      baseResw.current = responseWidth;
    },
    resizeResponse,
    resizeResponseWidth,
    zoomIn,
    zoomOut,
    zoomReset,
    resetLayout,
  };
}
