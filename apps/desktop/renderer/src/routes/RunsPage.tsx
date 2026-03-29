import { useEffect, useMemo, useState } from "react";
import { RunLogPanel } from "../components/runs/run-log-panel";
import { createDesktopClient } from "../lib/desktop-client";
import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";
import { useRunSubscription } from "../lib/use-run-subscription";
import type { DesktopRunEvent, DesktopRunSummary } from "../../../shared/runs";
import { mergeRunSummaries } from "../lib/run-summary-updater";

const EMPTY_EVENTS: DesktopRunEvent[] = [];

type DesktopRunEventStream = {
  subscribeAll?: (callback: (event: DesktopRunEvent) => void) => () => void;
};

export interface RunsPageProps {
  client?: SasikiDesktopApi;
  initialRuns?: DesktopRunSummary[];
  initialEvents?: Record<string, DesktopRunEvent[]>;
}

export function RunsPage({
  client = createDesktopClient(),
  initialRuns,
  initialEvents,
}: RunsPageProps) {
  const [runs, setRuns] = useState<DesktopRunSummary[]>(initialRuns ?? []);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRuns?.[0]?.runId ?? null);

  useEffect(() => {
    if (initialRuns === undefined) {
      void client.runs.listRuns().then((nextRuns: DesktopRunSummary[]) => {
        setRuns(nextRuns);
        setSelectedRunId((current) => current ?? nextRuns[0]?.runId ?? null);
      });
    }
  }, [client, initialRuns]);

  useEffect(() => {
    if (selectedRunId === null && runs[0]) {
      setSelectedRunId(runs[0].runId);
    }
  }, [runs, selectedRunId]);

  const seededEvents = selectedRunId ? initialEvents?.[selectedRunId] ?? EMPTY_EVENTS : EMPTY_EVENTS;
  const events = useRunSubscription(selectedRunId, client, seededEvents);
  const liveRuns = useMemo(() => mergeRunSummaries(runs, events), [events, runs]);
  const selectedRun = useMemo(
    () => liveRuns.find((run) => run.runId === selectedRunId) ?? null,
    [liveRuns, selectedRunId],
  );

  useEffect(() => {
    const subscription = (client.runs as DesktopRunEventStream).subscribeAll;
    if (!subscription) {
      return;
    }

    return subscription((event) => {
      setRuns((currentRuns) => mergeRunSummaries(currentRuns, [event]));

      if (event.type === "run.finished" || event.type === "run.interrupted") {
        void client.runs.listRuns().then((nextRuns: DesktopRunSummary[]) => {
          setRuns(nextRuns);
        });
      }
    });
  }, [client]);

  return (
    <section style={pageStyles}>
      <header style={heroStyles}>
        <div style={copyStackStyles}>
          <p style={eyebrowStyles}>Runs</p>
          <h2 style={headingStyles}>Track live workflow progress, logs, and artifacts</h2>
          <p style={copyStyles}>
            The main process owns run state. The renderer only subscribes to typed events and
            asks the preload bridge to open artifacts.
          </p>
        </div>
        <div style={summaryCardStyles}>
          <p style={summaryLabelStyles}>Run count</p>
          <strong style={summaryValueStyles}>{liveRuns.length}</strong>
        </div>
      </header>

      <div style={gridStyles}>
        <aside style={listPanelStyles}>
          <h3 style={listHeadingStyles}>Recent Runs</h3>
          <div style={runListStyles}>
            {runs.length === 0 ? (
              <p style={emptyStateStyles}>No runs yet.</p>
            ) : (
              liveRuns.map((run) => (
                <button
                  key={run.runId}
                  onClick={() => setSelectedRunId(run.runId)}
                  style={runButtonStyles(selectedRunId === run.runId)}
                  type="button"
                >
                  <span style={runButtonTitleStyles}>{run.taskSummary ?? run.runId}</span>
                  <span style={runButtonMetaStyles}>
                    {run.workflow} · {run.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <RunLogPanel
          events={events}
          onInterrupt={(runId) => void client.runs.interruptRun(runId)}
          onOpenArtifacts={(runId) => void client.artifacts.openRunArtifacts(runId)}
          run={selectedRun ?? undefined}
        />
      </div>
    </section>
  );
}

const pageStyles = {
  display: "grid",
  gap: "18px",
};

const heroStyles = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  alignItems: "stretch",
};

const copyStackStyles = {
  display: "grid",
  gap: "8px",
};

const eyebrowStyles = {
  margin: 0,
  textTransform: "uppercase" as const,
  letterSpacing: "0.16em",
  fontSize: "0.75rem",
  color: "#8c5b33",
};

const headingStyles = {
  margin: 0,
  fontSize: "1.85rem",
};

const copyStyles = {
  margin: 0,
  maxWidth: "760px",
  lineHeight: 1.6,
  color: "#54463b",
};

const summaryCardStyles = {
  alignSelf: "start",
  justifySelf: "end",
  minWidth: "180px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  background: "rgba(255, 255, 255, 0.76)",
  boxShadow: "0 18px 40px rgba(62, 48, 39, 0.08)",
};

const summaryLabelStyles = {
  margin: 0,
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  fontSize: "0.72rem",
  color: "#8a7868",
};

const summaryValueStyles = {
  display: "block",
  marginTop: "8px",
  fontSize: "2rem",
  color: "#2e241d",
};

const gridStyles = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
  alignItems: "start",
};

const listPanelStyles = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  background: "rgba(255, 255, 255, 0.72)",
  boxShadow: "0 18px 40px rgba(62, 48, 39, 0.08)",
};

const listHeadingStyles = {
  margin: 0,
  fontSize: "1rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.12em",
  color: "#7f6c5e",
};

const runListStyles = {
  display: "grid",
  gap: "10px",
};

const emptyStateStyles = {
  margin: 0,
  color: "#6b5a4d",
};

const runButtonStyles = (isSelected: boolean) => ({
  display: "grid",
  gap: "4px",
  textAlign: "left" as const,
  borderRadius: "16px",
  padding: "12px 14px",
  border: isSelected ? "1px solid rgba(160, 99, 32, 0.32)" : "1px solid rgba(62, 48, 39, 0.10)",
  background: isSelected ? "rgba(255, 244, 232, 0.95)" : "rgba(255, 255, 255, 0.82)",
  color: "#2e241d",
  cursor: "pointer",
});

const runButtonTitleStyles = {
  fontWeight: 600,
};

const runButtonMetaStyles = {
  fontSize: "0.82rem",
  color: "#7f6c5e",
};
