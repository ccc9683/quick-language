import { useState } from "react";

import TranslatorPage from "./pages/TranslatorPage";
import SayItPage from "./pages/SayItPage";
import LearningBookPage from "./pages/LearningBookPage";
import PartnerPage from "./pages/PartnerPage";

type Page = "translator" | "say-it" | "learning-book" | "partner";

type NavItem = {
  id: Page;
  label: string;
  desktopLabel?: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "translator", label: "Translator" },
  { id: "say-it", label: "Say It" },
  { id: "learning-book", label: "Book", desktopLabel: "Learning Book" },
  { id: "partner", label: "Partner" }
];

function App() {
  const [activePage, setActivePage] = useState<Page>("translator");
  const activeNavItem = NAV_ITEMS.find((item) => item.id === activePage) ?? NAV_ITEMS[0];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand-area">
            <span className="app-brand">LLP</span>
            <span className="app-current-page">{activeNavItem.label}</span>
          </div>

          <nav className="app-tabs" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <button
                aria-current={activePage === item.id ? "page" : undefined}
                className={activePage === item.id ? "tab active" : "tab"}
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
              >
                {item.desktopLabel ?? item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="app-page-content">
        {activePage === "translator" && <TranslatorPage />}
        {activePage === "say-it" && <SayItPage />}
        {activePage === "learning-book" && <LearningBookPage />}
        {activePage === "partner" && <PartnerPage />}
      </div>

      <nav className="mobile-bottom-tabs" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => (
          <button
            aria-current={activePage === item.id ? "page" : undefined}
            className={activePage === item.id ? "mobile-tab active" : "mobile-tab"}
            key={item.id}
            type="button"
            onClick={() => setActivePage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
