import { useState } from "react";
import { AccountsPage } from "./routes/AccountsPage";
import { RunsPage } from "./routes/RunsPage";
import { WorkflowsPage } from "./routes/WorkflowsPage";

type DesktopRoute = "workflows" | "accounts" | "runs";

const routes: Record<DesktopRoute, { label: string }> = {
  workflows: { label: "Workflows" },
  accounts: { label: "Accounts" },
  runs: { label: "Runs" },
};

export function App() {
  const [route, setRoute] = useState<DesktopRoute>("workflows");

  return (
    <main style={shellStyles}>
      <header style={headerStyles}>
        <div>
          <p style={eyebrowStyles}>Sasiki Desktop</p>
          <h1 style={titleStyles}>Electron foundation shell</h1>
        </div>
        <nav style={navStyles}>
          {(
            Object.entries(routes) as Array<[DesktopRoute, { label: string }]>
          ).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setRoute(key)}
              style={key === route ? activeTabStyles : tabStyles}
              type="button"
            >
              {config.label}
            </button>
          ))}
        </nav>
      </header>

      {route === "workflows" ? <WorkflowsPage /> : null}
      {route === "accounts" ? <AccountsPage /> : null}
      {route === "runs" ? <RunsPage /> : null}
    </main>
  );
}

const shellStyles = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, #fff8ec 0%, #f7efe2 45%, #efe7dc 100%)",
  color: "#1f1a17",
  padding: "32px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
};

const headerStyles = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: "24px",
  marginBottom: "32px",
};

const eyebrowStyles = {
  margin: 0,
  textTransform: "uppercase" as const,
  letterSpacing: "0.16em",
  fontSize: "0.75rem",
  color: "#7a5840",
};

const titleStyles = {
  margin: "8px 0 0",
  fontSize: "2.25rem",
};

const navStyles = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap" as const,
};

const tabStyles = {
  border: "1px solid #c4a88a",
  background: "rgba(255, 255, 255, 0.65)",
  color: "#5c4330",
  padding: "10px 16px",
  borderRadius: "999px",
  cursor: "pointer",
};

const activeTabStyles = {
  ...tabStyles,
  background: "#5c4330",
  color: "#fff8ec",
};
