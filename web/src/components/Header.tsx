import { type Lang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";

interface HeaderProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onGoToTop?: () => void;
  isScrolled?: boolean;
}

export default function Header({
  lang,
  onLangChange,
  onGoToTop,
  isScrolled = false,
}: HeaderProps) {
  const t = LANDING_COPY[lang];

  const handleBrandClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onGoToTop) {
      onGoToTop();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <header className={`landing-sticky-header ${isScrolled ? "is-scrolled" : ""}`}>
      <div className="landing-header-inner">
        {/* Marca / Logotipo */}
        <a
          className="landing-brand-link"
          href="/"
          onClick={handleBrandClick}
          aria-label={`${t.brandFirst} ${t.brandSecond}`}
        >
          <img
            className="landing-brand-mark"
            src="/icons/ChatGPT Image 23 ago 2026, 10_28_10.png"
            alt={`${t.brandFirst}${t.brandSecond}`}
          />
          <span className="landing-brand-text">
            {t.brandFirst}{t.brandSecond}
          </span>
        </a>

        {/* Selector de idioma */}
        <div className="landing-lang-toggle" role="group" aria-label="Idioma / Language">
          <button
            type="button"
            className={`landing-lang-btn ${lang === "es" ? "on" : ""}`}
            onClick={() => onLangChange("es")}
            aria-pressed={lang === "es"}
          >
            ES
          </button>
          <button
            type="button"
            className={`landing-lang-btn ${lang === "en" ? "on" : ""}`}
            onClick={() => onLangChange("en")}
            aria-pressed={lang === "en"}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  );
}

