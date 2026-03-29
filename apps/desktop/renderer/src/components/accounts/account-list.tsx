import type { SiteAccountSummary } from "../../../../shared/site-accounts";

export interface AccountListProps {
  accounts: SiteAccountSummary[];
  selectedAccountId?: string;
  onLaunchEmbeddedLogin(siteAccountId: string): void;
  onImportCookieFile(siteAccountId: string): void;
  onVerifyCredential(siteAccountId: string): void;
}

export function AccountList({
  accounts,
  selectedAccountId,
  onLaunchEmbeddedLogin,
  onImportCookieFile,
  onVerifyCredential,
}: AccountListProps) {
  if (accounts.length === 0) {
    return <p style={emptyStateStyles}>No site accounts yet.</p>;
  }

  return (
    <div style={gridStyles}>
      {accounts.map((account) => {
        const isSelected = account.id === selectedAccountId;

        return (
          <article key={account.id} style={isSelected ? selectedCardStyles : cardStyles}>
            <div style={cardHeaderStyles}>
              <div>
                <p style={eyebrowStyles}>{account.site}</p>
                <h3 style={titleStyles}>{account.label}</h3>
              </div>
              <span style={statusBadgeStyles}>{account.verificationStatus}</span>
            </div>

            <dl style={detailsStyles}>
              <div>
                <dt style={detailLabelStyles}>Credential source</dt>
                <dd style={detailValueStyles}>{account.activeCredentialSource ?? "missing"}</dd>
              </div>
              <div>
                <dt style={detailLabelStyles}>Credential updated</dt>
                <dd style={detailValueStyles}>{account.credentialUpdatedAt ?? "not captured yet"}</dd>
              </div>
              <div>
                <dt style={detailLabelStyles}>Last verified</dt>
                <dd style={detailValueStyles}>{account.lastVerifiedAt ?? "not checked yet"}</dd>
              </div>
              <div>
                <dt style={detailLabelStyles}>Runtime profile</dt>
                <dd style={detailValueStyles}>Managed automatically by Sasiki</dd>
              </div>
            </dl>

            <div style={buttonRowStyles}>
              <button
                onClick={() => onLaunchEmbeddedLogin(account.id)}
                style={primaryButtonStyles}
                type="button"
              >
                Login In Sasiki
              </button>
              <button
                onClick={() => onImportCookieFile(account.id)}
                style={secondaryButtonStyles}
                type="button"
              >
                Import Cookie File
              </button>
              <button
                onClick={() => onVerifyCredential(account.id)}
                style={secondaryButtonStyles}
                type="button"
              >
                Verify Login State
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

const gridStyles = {
  display: "grid",
  gap: "16px",
};

const cardStyles = {
  padding: "18px",
  borderRadius: "22px",
  border: "1px solid rgba(62, 48, 39, 0.12)",
  background: "rgba(255, 255, 255, 0.72)",
  boxShadow: "0 18px 40px rgba(62, 48, 39, 0.08)",
};

const selectedCardStyles = {
  ...cardStyles,
  border: "1px solid rgba(160, 99, 32, 0.32)",
  boxShadow: "0 22px 54px rgba(160, 99, 32, 0.14)",
};

const cardHeaderStyles = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  marginBottom: "14px",
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
  fontSize: "1.25rem",
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
  marginTop: "16px",
};

const buttonBaseStyles = {
  borderRadius: "999px",
  padding: "10px 14px",
  border: "1px solid transparent",
  cursor: "pointer",
  fontWeight: 600,
};

const primaryButtonStyles = {
  ...buttonBaseStyles,
  background: "#2e241d",
  color: "#fff7ee",
};

const secondaryButtonStyles = {
  ...buttonBaseStyles,
  background: "rgba(255, 255, 255, 0.82)",
  color: "#4f3b2d",
  border: "1px solid rgba(62, 48, 39, 0.16)",
};

const emptyStateStyles = {
  margin: 0,
  color: "#6b5a4d",
};
