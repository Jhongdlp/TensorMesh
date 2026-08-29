import { type Lang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";

interface HeaderProps {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  onGoToTop?: () => void;
  onGoToRooms?: () => void;
  isScrolled?: boolean;
  currentPath?: string;
}

export default function Header({
  lang,
  onLangChange,
  onGoToTop,
  onGoToRooms,
  isScrolled = false,
  currentPath,
}: HeaderProps) {
  const t = LANDING_COPY[lang];
  const isCollabActive = currentPath === "/colaborar" || currentPath === "/collaborate";

  const handleBrandClick = (e: React.MouseEvent) => {
    if (onGoToTop) {
      e.preventDefault();
      onGoToTop();
    }
  };

  const handleGalleryClick = (e: React.MouseEvent) => {
    if (onGoToRooms) {
      e.preventDefault();
      onGoToRooms();
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
            src="/icons/tensormesh-mark.png"
            width={256}
            height={256}
            decoding="async"
            fetchPriority="high"
            alt={`${t.brandFirst}${t.brandSecond}`}
          />
          <span className="landing-brand-text">
            {t.brandFirst}{t.brandSecond}
          </span>
        </a>

        {/* Acciones de Navegación & Idioma */}
        <div className="landing-nav-group">
          {/* Enlace a Galería */}
          <a
            className="landing-nav-link"
            href="/#galeria"
            onClick={handleGalleryClick}
          >
            <span>{lang === "es" ? "Galería" : "Gallery"}</span>
          </a>

          {/* Botón de Colaboración con Motion & Shimmer */}
          <a
            className={`landing-nav-collab-btn ${isCollabActive ? "active" : ""}`}
            href="/colaborar"
            title={lang === "es" ? "Galería pública y algoritmos colaborativos" : "Public gallery & collaborative algorithms"}
          >
            <span className="collab-btn-glow" aria-hidden="true" />
            <span className="collab-btn-content">
              <svg
                className="collab-btn-glyph"
                viewBox="0 0 14 14"
                width="13"
                height="13"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M7 1L12.5 7L7 13L1.5 7L7 1Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <circle cx="7" cy="7" r="1.5" fill="currentColor" />
              </svg>
              <span>{lang === "es" ? "Colaborar" : "Collaborate"}</span>
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
      </div>
    </header>
  );
}


