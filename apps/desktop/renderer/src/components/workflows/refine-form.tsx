import { useState } from "react";
import type { RefineRunInput } from "../../../../shared/runs";
import type { SiteAccountSummary } from "../../../../shared/site-accounts";
import type { SopSkillSummary } from "../../../../shared/skills";

export interface RefineFormProps {
  accounts: SiteAccountSummary[];
  skills: SopSkillSummary[];
  onSubmit(input: RefineRunInput): void;
}

export function RefineForm({ accounts, skills, onSubmit }: RefineFormProps) {
  const [task, setTask] = useState("Review inbox");
  const [siteAccountId, setSiteAccountId] = useState("");
  const [skillName, setSkillName] = useState("");
  const [resumeRunId, setResumeRunId] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          task: task.trim() || undefined,
          siteAccountId: siteAccountId || undefined,
          skillName: skillName || undefined,
          resumeRunId: resumeRunId.trim() || undefined,
        });
      }}
      style={formStyles}
    >
      <div style={fieldGroupStyles}>
        <label htmlFor="refine-task" style={labelStyles}>
          Refine Task
        </label>
        <textarea
          id="refine-task"
          onChange={(event) => setTask(event.target.value)}
          rows={4}
          style={textareaStyles}
          value={task}
        />
      </div>

      <div style={fieldRowStyles}>
        <div style={fieldGroupStyles}>
          <label htmlFor="refine-site-account" style={labelStyles}>
            Site account
          </label>
          <select
            id="refine-site-account"
            onChange={(event) => setSiteAccountId(event.target.value)}
            style={selectStyles}
            value={siteAccountId}
          >
            <option value="">No site account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldGroupStyles}>
          <label htmlFor="refine-skill" style={labelStyles}>
            Skill
          </label>
          <select
            id="refine-skill"
            onChange={(event) => setSkillName(event.target.value)}
            style={selectStyles}
            value={skillName}
          >
            <option value="">No skill</option>
            {skills.map((skill) => (
              <option key={skill.name} value={skill.name}>
                {skill.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={fieldGroupStyles}>
        <label htmlFor="refine-resume-run" style={labelStyles}>
          Resume Run Id
        </label>
        <input
          id="refine-resume-run"
          onChange={(event) => setResumeRunId(event.target.value)}
          placeholder="Optional resume run id"
          style={inputStyles}
          value={resumeRunId}
        />
      </div>

      <button style={primaryButtonStyles} type="submit">
        Start Refine
      </button>
    </form>
  );
}

const formStyles = {
  display: "grid",
  gap: "14px",
};

const fieldRowStyles = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const inputStyles = controlStyles;
const textareaStyles = {
  ...controlStyles,
  resize: "vertical" as const,
};
const selectStyles = controlStyles;

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
