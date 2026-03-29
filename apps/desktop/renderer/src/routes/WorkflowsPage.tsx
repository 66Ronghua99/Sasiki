import { useEffect, useState } from "react";
import { CompactForm } from "../components/workflows/compact-form";
import { ObserveForm } from "../components/workflows/observe-form";
import { RefineForm } from "../components/workflows/refine-form";
import { createDesktopClient } from "../lib/desktop-client";
import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";
import type { CompactRunInput, DesktopRunSummary, ObserveRunInput, RefineRunInput } from "../../../shared/runs";
import type { SiteAccountSummary } from "../../../shared/site-accounts";
import type { SopSkillSummary } from "../../../shared/skills";

export interface WorkflowsPageProps {
  client?: SasikiDesktopApi;
  initialAccounts?: SiteAccountSummary[];
  initialRuns?: DesktopRunSummary[];
  initialSkills?: SopSkillSummary[];
}

export function WorkflowsPage({
  client = createDesktopClient(),
  initialAccounts,
  initialRuns,
  initialSkills,
}: WorkflowsPageProps) {
  const [accounts, setAccounts] = useState<SiteAccountSummary[]>(initialAccounts ?? []);
  const [runs, setRuns] = useState<DesktopRunSummary[]>(initialRuns ?? []);
  const [skills, setSkills] = useState<SopSkillSummary[]>(initialSkills ?? []);
  const [statusMessage, setStatusMessage] = useState<string>(
    "Choose a workflow, fill the minimal fields, and let Sasiki resolve the runtime details.",
  );

  useEffect(() => {
    if (initialAccounts === undefined) {
      void client.accounts.list().then((nextAccounts: SiteAccountSummary[]) => {
        setAccounts(nextAccounts);
      });
    }
    if (initialRuns === undefined) {
      void client.runs.listRuns().then((nextRuns: DesktopRunSummary[]) => {
        setRuns(nextRuns);
      });
    }
    if (initialSkills === undefined) {
      void client.skills.list().then((nextSkills: SopSkillSummary[]) => {
        setSkills(nextSkills);
      });
    }
  }, [client, initialAccounts, initialRuns, initialSkills]);

  return (
    <section style={pageStyles}>
      <header style={heroStyles}>
        <div style={copyStackStyles}>
          <p style={eyebrowStyles}>Workflows</p>
          <h2 style={headingStyles}>Observe, compact, and refine from one control surface</h2>
          <p style={copyStyles}>
            The renderer stays on the typed preload bridge. Site accounts are optional context
            for the workflows that need them, and Chromium profiles remain an internal detail.
          </p>
        </div>
        <div style={summaryCardStyles}>
          <p style={summaryLabelStyles}>Status</p>
          <strong style={summaryValueStyles}>{statusMessage}</strong>
        </div>
      </header>

      <div style={gridStyles}>
        <article style={cardStyles}>
          <h3 style={cardTitleStyles}>Observe</h3>
          <ObserveForm
            accounts={accounts}
            onSubmit={(input: ObserveRunInput) => {
              setStatusMessage(`Launching observe for ${input.task.slice(0, 48)}`);
              void client.runs.startObserve(input);
            }}
          />
        </article>

        <article style={cardStyles}>
          <h3 style={cardTitleStyles}>SOP Compact</h3>
          <CompactForm
            observeRuns={runs.filter((run) => run.workflow === "observe")}
            onSubmit={(input: CompactRunInput) => {
              setStatusMessage(`Compacting source run ${input.sourceRunId}`);
              void client.runs.startCompact(input);
            }}
          />
        </article>

        <article style={cardStyles}>
          <h3 style={cardTitleStyles}>Refine</h3>
          <RefineForm
            accounts={accounts}
            skills={skills}
            onSubmit={(input: RefineRunInput) => {
              const seed = input.resumeRunId ?? input.task ?? "unknown refine task";
              setStatusMessage(`Launching refine from ${seed.slice(0, 48)}`);
              void client.runs.startRefine(input);
            }}
          />
        </article>
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
  minWidth: "220px",
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
  fontSize: "1rem",
  lineHeight: 1.45,
  color: "#2e241d",
};

const gridStyles = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
};

const cardStyles = {
  display: "grid",
  gap: "14px",
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  background: "rgba(255, 255, 255, 0.72)",
  boxShadow: "0 18px 40px rgba(62, 48, 39, 0.08)",
};

const cardTitleStyles = {
  margin: 0,
  fontSize: "1.2rem",
};
