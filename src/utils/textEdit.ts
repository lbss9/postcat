/**
 * Helpers for the text-editing context menu (Cut / Copy / Paste / Select all).
 *
 * Inputs and textareas are handled precisely via their selection range so React
 * state stays in sync; a contenteditable surface (the CodeMirror editor) gets
 * Copy and Select all, while Cut/Paste there stay on the keyboard shortcuts.
 */

export type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function isTextInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  const tag = el.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
  const field = el as HTMLInputElement;
  return !field.readOnly && !field.disabled;
}

export function closestEditable(el: Element | null): EditableTarget | null {
  let cur: Element | null = el;
  while (cur) {
    if (isTextInput(cur)) return cur;
    if ((cur as HTMLElement).isContentEditable) return cur as HTMLElement;
    cur = cur.parentElement;
  }
  return null;
}

export function selectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

export function fieldHasSelection(el: EditableTarget): boolean {
  if (isTextInput(el)) return el.selectionStart !== el.selectionEnd;
  return selectedText().length > 0;
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked — best effort */
  }
}

async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

/** Replace the current selection of an input/textarea and fire a React input event. */
function replaceRange(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, next);
  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function copyFrom(el: EditableTarget, captured?: string): Promise<void> {
  if (isTextInput(el)) {
    const s = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (s) await writeClipboard(s);
  } else {
    // clicking the menu button can collapse a contenteditable selection, so
    // prefer the text captured when the menu opened
    const s = captured || selectedText();
    if (s) await writeClipboard(s);
  }
}

export async function cutFrom(el: EditableTarget): Promise<void> {
  if (!isTextInput(el)) return;
  const s = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
  if (!s) return;
  await writeClipboard(s);
  el.focus();
  replaceRange(el, "");
}

export async function pasteInto(el: EditableTarget): Promise<void> {
  if (!isTextInput(el)) return;
  const text = await readClipboard();
  if (!text) return;
  el.focus();
  replaceRange(el, text);
}

export function selectAll(el: EditableTarget): void {
  el.focus();
  if (isTextInput(el)) el.setSelectionRange(0, el.value.length);
  else document.getSelection()?.selectAllChildren(el);
}
