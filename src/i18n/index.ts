import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import ptBR from "./pt-BR.json";

/** Languages the app ships with. Add a locale file + entry here to grow the list. */
export const LANGUAGES = [
  { code: "en", label: "EN", name: "English" },
  { code: "pt-BR", label: "PT", name: "Português (BR)" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "pt-BR": { translation: ptBR },
      // alias so a bare "pt" from the OS/browser resolves to pt-BR
      pt: { translation: ptBR },
    },
    fallbackLng: "en",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "postcat-lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

// keep <html lang> in sync for accessibility
i18n.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});
document.documentElement.setAttribute("lang", i18n.language || "en");

export default i18n;
