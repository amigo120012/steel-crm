import logo from "../assets/logo.png";

// Chrome for the public, unauthenticated pages (the RFQ form and Contact Us).
// Logo and a footer only — no nav into the internal CRM, by design.

export default function PublicShell({ children }) {
  return (
    <div className="public-page">
      <header className="public-header no-print">
        <a href="/" className="public-logo-link" aria-label="Phoenix Steel Supply Inc. — home">
          <img src={logo} alt="Phoenix Steel Supply Inc." className="brand-logo public-brand-logo" />
        </a>
      </header>

      <div className="public-shell">{children}</div>

      <footer className="public-footer no-print">
        <a className="btn-outline contact-btn" href="/contact">Contact Us</a>
        <p className="public-footer-note">
          © {new Date().getFullYear()} Phoenix Steel Supply Inc.
        </p>
      </footer>
    </div>
  );
}
