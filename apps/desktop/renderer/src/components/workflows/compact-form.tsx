import { useEffect, useState } from "react";
import type { CompactRunInput, DesktopRunSummary } from "../../../../shared/runs";

export interface CompactFormProps {
  observeRuns: DesktopRunSummary[];
  onSubmit(input: CompactRunInput): void;
}

export function CompactForm({ observeRuns, onSubmit }: CompactFormProps) {
  const [sourceRunId, setSourceRunId] = useState(observeRuns[0]?.runId ?? "");
  const [semanticMode, setSemanticMode] = useState<CompactRunInput["semanticMode"]>("preserve");

  useEffect(() => {
    if (sourceRunId && observeRuns.some((run) => run.runId === sourceRunId)) {
      return;
    }

    setSourceRunId(observeRuns[0]?.runId ?? "");
  }, [observeRuns, sourceRunId]);

  const canSubmit = sourceRunId.trim().length > 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) {
          return;
        }
        onSubmit({
          sourceRunId: sourceRunId.trim(),
          semanticMode,
        });
      }}
      style={formStyles}
    >
      <div style={fieldGroupStyles}>
        <label htmlFor="compact-source-run" style={labelStyles}>
          Source Observe Run
        </label>
        <select
          id="compact-source-run"
          onChange={(event) => setSourceRunId(event.target.value)}
          style={selectStyles}
          value={sourceRunId}
        >
          <option value="">Select an observe run</option>
          {observeRuns.map((run) => (
            <option key={run.runId} value={run.runId}>
              {run.runId} - {run.taskSummary ?? "No summary"}
            </option>
          ))}
        </select>
      </div>

      <details style={detailsStyles}>
        <summary style={summaryStyles}>Advanced</summary>
        <div style={fieldGroupStyles}>
          <label htmlFor="compact-semantic-mode" style={labelStyles}>
            Semantic Mode
          </label>
          <select
            id="compact-semantic-mode"
            onChange={(event) =>
              setSemanticMode(event.target.value as CompactRunInput["semanticMode"])
            }
            style={selectStyles}
            value={semanticMode}
          >
            <option value="preserve">preserve</option>
            <option value="summarize">summarize</option>
          </select>
        </div>
      </details>

      <button disabled={!canSubmit} style={primaryButtonStyles} type="submit">
        Start SOP Compact
      </button>
    </form>
  );
}

const formStyles = {
  display: "grid",
  gap: "14px",
};

const fieldGroupStyles = {
  display: "grid",
  gap: "8px",
};

const labelStyles = {
  fontSize: "0.86rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "#7f6c5e",
};

const controlStyles = {
  borderRadius: "16px",
  border: "1px solid rgba(62, 48, 39, 0.16)",
  background: "rgba(255, 255, 255, 0.9)",
  color: "#2e241d",
  padding: "12px 14px",
  font: "inherit",
};

const selectStyles = controlStyles;

const detailsStyles = {
  borderRadius: "16px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  padding: "12px 14px",
  background: "rgba(255, 255, 255, 0.6)",
};

const summaryStyles = {
  cursor: "pointer",
  fontWeight: 600,
  color: "#4f3b2d",
};

const primaryButtonStyles = {
  alignSelf: "start",
  borderRadius: "999px",
  padding: "10px 16px",
  border: "1px solid transparent",
  background: "#2e241d",
  color: "#fff7ee",
  cursor: "pointer",
  fontWeight: 600,
};
