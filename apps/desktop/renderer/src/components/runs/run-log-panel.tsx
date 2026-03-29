import type { DesktopRunEvent, DesktopRunSummary } from "../../../../shared/runs";

export interface RunLogPanelProps {
  run?: DesktopRunSummary;
  events: DesktopRunEvent[];
  onOpenArtifacts?(runId: string): void;
  onInterrupt?(runId: string): void;
}

export function RunLogPanel({ run, events, onOpenArtifacts, onInterrupt }: RunLogPanelProps) {
  if (!run) {
    return <p style={emptyStateStyles}>Select a run to inspect live logs and artifacts.</p>;
  }

  return (
    <article style={panelStyles}>
      <div style={headerStyles}>
        <div>
          <p style={eyebrowStyles}>{run.workflow}</p>
          <h3 style={titleStyles}>{run.taskSummary ?? run.runId}</h3>
        </div>
        <span style={statusBadgeStyles}>{run.status}</span>
      </div>

      <dl style={detailsStyles}>
        <div>
          <dt style={detailLabelStyles}>Run Id</dt>
          <dd style={detailValueStyles}>{run.runId}</dd>
        </div>
        <div>
          <dt style={detailLabelStyles}>Site account</dt>
          <dd style={detailValueStyles}>{run.siteAccountId ?? "none"}</dd>
        </div>
        <div>
          <dt style={detailLabelStyles}>Artifacts</dt>
          <dd style={detailValueStyles}>{run.artifactPath ?? "not ready yet"}</dd>
        </div>
      </dl>

      <div style={buttonRowStyles}>
        <button
          disabled={!run.artifactPath}
          onClick={() => onOpenArtifacts?.(run.runId)}
          style={secondaryButtonStyles}
          type="button"
        >
          Open Artifacts
        </button>
        <button onClick={() => onInterrupt?.(run.runId)} style={secondaryButtonStyles} type="button">
          Interrupt Run
        </button>
      </div>

      <section style={logSectionStyles}>
        <h4 style={logHeadingStyles}>Live Log</h4>
        <ul style={logListStyles}>
          {events.length === 0 ? (
            <li style={emptyStateStyles}>No live events yet.</li>
          ) : (
            events.map((event, index) => (
              <li key={`${event.type}-${event.timestamp}-${index}`} style={logItemStyles}>
                <span style={logMetaStyles}>
                  {event.type} · {event.type === "run.log" ? run.status : event.status}
                </span>
                {"message" in event ? (
                  <span style={logTextStyles}>{event.message}</span>
                ) : "resultSummary" in event && event.resultSummary ? (
                  <span style={logTextStyles}>{event.resultSummary}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </article>
  );
}

const panelStyles = {
  display: "grid",
  gap: "16px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  background: "rgba(255, 255, 255, 0.72)",
  boxShadow: "0 18px 40px rgba(62, 48, 39, 0.08)",
};

const headerStyles = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
};

const eyebrowStyles = {
  margin: 0,
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontSize: "0.72rem",
  color: "#8c5b33",
};

const titleStyles = {
  margin: "6px 0 0",
  fontSize: "1.35rem",
};

const statusBadgeStyles = {
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "0.76rem",
  textTransform: "capitalize" as const,
  background: "rgba(140, 91, 51, 0.12)",
  color: "#6b4527",
};

const detailsStyles = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px 14px",
  margin: 0,
};

const detailLabelStyles = {
  fontSize: "0.74rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "#8a7868",
};

const detailValueStyles = {
  margin: "4px 0 0",
  fontSize: "0.98rem",
  color: "#2e241d",
};

const buttonRowStyles = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "10px",
};

const secondaryButtonStyles = {
  borderRadius: "999px",
  padding: "10px 14px",
  border: "1px solid rgba(62, 48, 39, 0.16)",
  background: "rgba(255, 255, 255, 0.82)",
  color: "#4f3b2d",
  cursor: "pointer",
  fontWeight: 600,
};

const logSectionStyles = {
  display: "grid",
  gap: "10px",
};

const logHeadingStyles = {
  margin: 0,
  fontSize: "0.96rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "#7f6c5e",
};

const logListStyles = {
  display: "grid",
  gap: "10px",
  listStyle: "none",
  padding: 0,
  margin: 0,
};

const logItemStyles = {
  display: "grid",
  gap: "4px",
  padding: "12px 14px",
  borderRadius: "16px",
  background: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(62, 48, 39, 0.08)",
};

const logMetaStyles = {
  fontSize: "0.78rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "#8a7868",
};

const logTextStyles = {
  color: "#2e241d",
  lineHeight: 1.5,
};

const emptyStateStyles = {
  margin: 0,
  color: "#6b5a4d",
};
