import { createContext, useContext, type ReactNode } from "react";
import type { Language } from "../types/models";

type I18nContextValue = {
  language: Language;
  locale: string;
  t: (german: string, english: string) => string;
};

const I18nContext = createContext<I18nContextValue>({
  language: "en",
  locale: "en-US",
  t: (_german, english) => english,
});

export function translate(language: Language, german: string, english: string) {
  return language === "en" ? english : german;
}

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value: I18nContextValue = {
    language,
    locale: language === "en" ? "en-US" : "de-DE",
    t: (german, english) => translate(language, german, english),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
