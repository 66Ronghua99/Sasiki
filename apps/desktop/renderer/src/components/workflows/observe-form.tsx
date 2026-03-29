import { useState } from "react";
import type { ObserveRunInput } from "../../../../shared/runs";
import type { SiteAccountSummary } from "../../../../shared/site-accounts";

export interface ObserveFormProps {
  accounts: SiteAccountSummary[];
  onSubmit(input: ObserveRunInput): void;
}

export function ObserveForm({ accounts, onSubmit }: ObserveFormProps) {
  const [task, setTask] = useState("Record a browser flow");
  const [siteAccountId, setSiteAccountId] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          task: task.trim(),
          siteAccountId: siteAccountId || undefined,
        });
      }}
      style={formStyles}
    >
      <div style={fieldGroupStyles}>
        <label htmlFor="observe-task" style={labelStyles}>
          Observe Task
        </label>
        <textarea
          id="observe-task"
          onChange={(event) => setTask(event.target.value)}
          rows={4}
          style={textareaStyles}
          value={task}
        />
      </div>

      <div style={fieldGroupStyles}>
        <label htmlFor="observe-site-account" style={labelStyles}>
          Site account
        </label>
        <select
          id="observe-site-account"
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

      <button style={primaryButtonStyles} type="submit">
        Start Observe
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
