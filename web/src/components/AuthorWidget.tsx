import { useState } from "react";
import { type Lang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";

interface AuthorWidgetProps {
  lang: Lang;
}

interface SocialLink {
  id: string;
  name: string;
  url: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  color: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  {
    id: "github",
    name: "GitHub",
    url: "https://github.com/Jhongdlp",
    color: "#e6e6e6",
    icon: (props) => (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...props}>
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://linkedin.com/in/jhongdlp",
    color: "#0A66C2",
    icon: (props) => (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" {...props}>
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
      </svg>
    ),
  },
  {
    id: "x",
    name: "X (Twitter)",
    url: "https://x.com/jhongdlp",
    color: "#FFFFFF",
    icon: (props) => (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" {...props}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://instagram.com/jhongdlp",
    color: "#E1306C",
    icon: (props) => (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" {...props}>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
];

export default function AuthorWidget({ lang }: AuthorWidgetProps) {
  const t = LANDING_COPY[lang];
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`author-floating-widget ${isOpen ? "is-open" : ""}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(e) => {
        // Cerrar solo si el foco sale del widget entero
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
    >
      {/* Menú de redes en abanico/columna con bolitas */}
      <div className="author-social-bubbles" role="menu" aria-label="Redes sociales">
        {SOCIAL_LINKS.map((link, idx) => {
          const Icon = link.icon;
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="author-bubble"
              style={{
                "--delay": `${idx * 0.05}s`,
              } as React.CSSProperties}
              title={link.name}
              aria-label={link.name}
              role="menuitem"
            >
              <Icon className="author-bubble-icon" aria-hidden="true" />
              <span className="author-bubble-tooltip">{link.name}</span>
            </a>
          );
        })}
      </div>

      {/* Botón principal con avatar grande y texto */}
      <button
        type="button"
        className="author-trigger-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`${t.builtBy} Jhon`}
      >
        <div className="author-avatar-frame">
          <img
            src="/icons/portrait-v4(2).png"
            alt="Jhon"
            className="author-avatar-img"
            loading="eager"
          />
          <span className="author-status-pulse" aria-hidden="true" />
        </div>
        <div className="author-text-wrap">
          <span className="author-tagline">{t.builtBy}</span>
          <span className="author-name">Jhon @Jhongdlp</span>
        </div>
        <div className="author-arrow-indicator" aria-hidden="true">
          <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
            <path d="M5 2l4 4H1l4-4z" />
          </svg>
        </div>
      </button>
    </div>
  );
}
