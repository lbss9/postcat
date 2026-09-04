import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  placeholder as placeholderExt,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  bracketMatching,
} from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { xml } from "@codemirror/lang-xml";
import type { Extension } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { PC_API } from "../lib/pcApi";

export type CodeLang = "javascript" | "json" | "html" | "xml" | "text";

export interface CodeEditorHandle {
  insert: (text: string) => void;
}

function languageExtension(lang: CodeLang): Extension {
  switch (lang) {
    case "json":
      return json();
    case "html":
      return html();
    case "xml":
      return xml();
    case "text":
      return [];
    default:
      return javascript();
  }
}

/* colours pull from the app's theme variables so both light and dark work */
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword], color: "var(--patch)" },
  { tag: [t.string, t.special(t.string)], color: "var(--j-str)" },
  { tag: [t.number, t.bool, t.null], color: "var(--j-num)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--put)" },
  { tag: [t.definition(t.variableName)], color: "var(--head)" },
  { tag: [t.propertyName], color: "var(--j-key)" },
  { tag: [t.variableName], color: "var(--text)" },
  { tag: [t.className, t.typeName, t.namespace], color: "var(--post)" },
  { tag: [t.operator], color: "var(--text-soft)" },
  { tag: [t.bracket, t.punctuation, t.separator], color: "var(--text-soft)" },
]);

const theme = EditorView.theme({
  "&": {
    color: "var(--text)",
    backgroundColor: "var(--bg)",
    height: "100%",
    fontSize: "var(--editor-font-size, 13px)",
    borderRadius: "9px",
  },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "10px 4px" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--text-faint)", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-soft)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--panel-2) 55%, transparent)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-matchingBracket": {
    outline: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)",
    backgroundColor: "transparent",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line-2)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    color: "var(--text)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--mono)",
    fontSize: "12.5px",
    maxHeight: "16em",
  },
  ".cm-tooltip-autocomplete ul li": { padding: "3px 8px", color: "var(--text)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--on-accent)",
  },
  ".cm-completionLabel": { fontFamily: "var(--mono)" },
  ".cm-completionDetail": { color: "var(--text-faint)", fontStyle: "normal", marginLeft: "1em" },
  "li[aria-selected] .cm-completionDetail": { color: "var(--on-accent)", opacity: 0.85 },
  ".cm-completionInfo": {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line-2)",
    borderRadius: "8px",
    padding: "9px 11px",
    color: "var(--text-soft)",
    fontFamily: "var(--sans)",
    fontSize: "12px",
    lineHeight: "1.5",
    maxWidth: "300px",
  },
  ".cm-completionIcon": { paddingRight: "14px", opacity: 0.8 },
});

/** completion source for the pc.* API + a top-level `pc` */
function pcCompletions(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  // member access: <path>.<partial>
  const member = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.([A-Za-z_$]*)$/.exec(before);
  if (member) {
    const path = member[1];
    const partial = member[2];
    const members = PC_API[path];
    if (!members) return null;
    return {
      from: ctx.pos - partial.length,
      validFor: /^[\w$]*$/,
      options: members.map((m) => ({
        label: m.label,
        type: m.kind === "method" ? "method" : "property",
        detail: m.detail,
        info: () => {
          const el = document.createElement("div");
          el.textContent = m.info;
          return el;
        },
        apply:
          m.kind === "method"
            ? (view: EditorView, _c: unknown, from: number, to: number) => {
                view.dispatch({
                  changes: { from, to, insert: `${m.label}()` },
                  selection: { anchor: from + m.label.length + 1 },
                });
              }
            : m.label,
      })),
    };
  }

  // bare word: offer `pc`
  const word = ctx.matchBefore(/[\w$]+/);
  if (word && word.text.length > 0 && "pc".startsWith(word.text.toLowerCase())) {
    return {
      from: word.from,
      validFor: /^[\w$]*$/,
      options: [{ label: "pc", type: "variable", detail: "PostCat API", info: "The scripting API root — env, request, response, test, expect, console." }],
    };
  }
  return null;
}

const CodeEditor = forwardRef<CodeEditorHandle, {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** syntax to highlight (default javascript) */
  language?: CodeLang;
  /** enable the pc.* scripting autocomplete (scripts editor only) */
  scripting?: boolean;
  /** one indent level — spaces or "\t" (default two spaces) */
  indent?: string;
}>(function CodeEditor(
  { value, onChange, placeholder, language = "javascript", scripting = false, indent = "  " },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const v = view.current;
      if (!v) return;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      v.focus();
    },
  }));

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        indentUnit.of(indent),
        EditorState.tabSize.of(indent === "\t" ? 4 : indent.length),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true, icons: true }),
        languageExtension(language),
        ...(scripting
          ? [javascriptLanguage.data.of({ autocomplete: pcCompletions })]
          : []),
        syntaxHighlighting(highlight),
        theme,
        placeholder ? placeholderExt(placeholder) : [],
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the doc in sync when the value is changed from outside (e.g. reset)
  useEffect(() => {
    const v = view.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="code-editor" ref={host} />;
});

export default CodeEditor;
