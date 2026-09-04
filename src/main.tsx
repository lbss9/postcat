import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/pages/App";
import { ContextMenuProvider } from "@/components/molecules/ContextMenu";
import "./i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ContextMenuProvider>
      <App />
    </ContextMenuProvider>
  </React.StrictMode>,
);
