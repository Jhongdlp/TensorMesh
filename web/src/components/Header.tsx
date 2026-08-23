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
          <svg className="landing-brand-mark" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M0 2h5v3H2v3H0V2zm11 0h5v6h-2V5h-3V2zM2 8h3v3H2V8zm9 0h3v3h-3V8zM5 5h6v3H5V5zm0 6h6v3H5v-3zm2 3h2v2H7v-2z"
            />
          </svg>
          <span className="landing-brand-text">
            <span className="brand-word-1">{t.brandFirst}</span>
            <span className="brand-word-2">{t.brandSecond}</span>
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

