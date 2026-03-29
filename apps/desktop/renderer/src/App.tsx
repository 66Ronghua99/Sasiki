import { useState } from "react";
import { AccountsPage } from "./routes/AccountsPage";
import { RunsPage } from "./routes/RunsPage";
import { WorkflowsPage } from "./routes/WorkflowsPage";

type DesktopRoute = "workflows" | "accounts" | "runs";

const routes: Record<DesktopRoute, { label: string; copy: string }> = {
  workflows: {
    label: "Workflows",
    copy: "Trigger observe, compact, and refine from one command surface.",
  },
  accounts: {
    label: "Accounts",
    copy: "Capture cookies, verify logins, and manage site accounts.",
  },
  runs: {
    label: "Runs",
    copy: "Watch lifecycle events, logs, and artifact actions as they happen.",
  },
};

export function App() {
  const [route, setRoute] = useState<DesktopRoute>("workflows");

  return (
    <main style={shellStyles}>
      <div style={orbStyles} />
      <header style={headerStyles}>
        <div style={brandStackStyles}>
          <p style={eyebrowStyles}>Sasiki Desktop</p>
          <h1 style={titleStyles}>Chromium-first control room</h1>
          <p style={subtitleStyles}>
            A thin Electron front door over the shared runtime, account, and run contracts.
          </p>
        </div>

        <nav aria-label="Desktop sections" style={navStyles}>
          {(Object.entries(routes) as Array<[DesktopRoute, (typeof routes)[DesktopRoute]]>).map(
            ([key, config]) => (
              <button
                key={key}
                onClick={() => setRoute(key)}
                style={key === route ? activeTabStyles : tabStyles}
                type="button"
              >
                <span style={tabLabelStyles}>{config.label}</span>
                <span style={tabCopyStyles}>{config.copy}</span>
              </button>
            ),
          )}
        </nav>
      </header>

      <section style={workspaceStyles}>
        {route === "workflows" ? <WorkflowsPage /> : null}
        {route === "accounts" ? <AccountsPage /> : null}
        {route === "runs" ? <RunsPage /> : null}
      </section>
    </main>
  );
}

const shellStyles = {
  position: "relative" as const,
  minHeight: "100vh",
  overflow: "hidden",
  padding: "32px",
  color: "#241a14",
  background:
    "radial-gradient(circle at top left, rgba(233, 171, 91, 0.28), transparent 28%), linear-gradient(180deg, #fffaf2 0%, #f7efe2 46%, #ede4d8 100%)",
  fontFamily:
    '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif',
};

const orbStyles = {
  position: "absolute" as const,
  inset: "-120px auto auto -120px",
  width: "320px",
  height: "320px",
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(243, 183, 108, 0.3), transparent 70%)",
  filter: "blur(12px)",
  pointerEvents: "none" as const,
};

const headerStyles = {
  position: "relative" as const,
  display: "grid",
  gap: "24px",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 1.3fr)",
  alignItems: "end",
  marginBottom: "28px",
};

const brandStackStyles = {
  display: "grid",
  gap: "8px",
  maxWidth: "520px",
};

const eyebrowStyles = {
  margin: 0,
  textTransform: "uppercase" as const,
  letterSpacing: "0.18em",
  fontSize: "0.75rem",
  color: "#91613c",
};

const titleStyles = {
  margin: 0,
  fontSize: "2.5rem",
  lineHeight: 1.02,
};

const subtitleStyles = {
  margin: 0,
  lineHeight: 1.55,
  color: "#5e4b3b",
  fontSize: "1rem",
};

const navStyles = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const tabStyles = {
  display: "grid",
  gap: "6px",
  textAlign: "left" as const,
  border: "1px solid rgba(86, 63, 44, 0.16)",
  borderRadius: "22px",
  background: "rgba(255, 255, 255, 0.7)",
  color: "#5a4332",
  padding: "14px 16px",
  cursor: "pointer",
  boxShadow: "0 12px 28px rgba(78, 60, 42, 0.06)",
};

const activeTabStyles = {
  ...tabStyles,
  background: "#2e241d",
  color: "#fff7ee",
  border: "1px solid rgba(46, 36, 29, 0.9)",
  boxShadow: "0 16px 36px rgba(46, 36, 29, 0.22)",
};

const tabLabelStyles = {
  fontSize: "0.95rem",
  fontWeight: 700,
};

const tabCopyStyles = {
  fontSize: "0.8rem",
  lineHeight: 1.45,
  opacity: 0.9,
};

const workspaceStyles = {
  position: "relative" as const,
  padding: "22px",
  borderRadius: "30px",
  border: "1px solid rgba(86, 63, 44, 0.14)",
  background: "rgba(255, 255, 255, 0.58)",
  boxShadow: "0 24px 62px rgba(78, 60, 42, 0.08)",
  backdropFilter: "blur(16px)",
};
