import { useState, useEffect, useCallback } from "react";

export type Lang = "es" | "en";

export const LANG_STORAGE_KEY = "atlas_lang";
export const LANG_CHANGE_EVENT = "atlas-lang-change";

export function getStoredLang(fallback: Lang = "es"): Lang {
  if (typeof window === "undefined") return fallback;
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "es" || q === "en") return q;
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {}
  return fallback;
}

export function setStoredLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    const u = new URL(window.location.href);
    u.searchParams.set("lang", lang);
    window.history.replaceState(null, "", u.toString());
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: lang }));
  } catch {}
}

export function useAtlasLang(initial?: Lang): [Lang, (lang: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(() => initial ?? getStoredLang());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail === "es" || detail === "en") {
        setLangState(detail);
      }
    };
    window.addEventListener(LANG_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, handler);
  }, []);

  const changeLang = useCallback((next: Lang) => {
    setLangState(next);
    setStoredLang(next);
  }, []);

  return [lang, changeLang];
}
