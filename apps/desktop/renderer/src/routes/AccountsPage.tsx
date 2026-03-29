import { useEffect, useState } from "react";
import { AccountList } from "../components/accounts/account-list";
import { resolveDesktopClient } from "../lib/desktop-client";
import type { SasikiDesktopApi } from "../../../shared/ipc/contracts";
import type { SiteAccountSummary } from "../../../shared/site-accounts";

export interface AccountsPageProps {
  client?: SasikiDesktopApi;
  initialAccounts?: SiteAccountSummary[];
}

export function AccountsPage({ client, initialAccounts }: AccountsPageProps) {
  const desktopClient = resolveDesktopClient(client);
  const [accounts, setAccounts] = useState<SiteAccountSummary[]>(initialAccounts ?? []);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = async (): Promise<void> => {
    if (!desktopClient) {
      return;
    }

    const nextAccounts = await desktopClient.accounts.list();
    setAccounts(nextAccounts);
    setError(null);
  };

  useEffect(() => {
    if (initialAccounts !== undefined || !desktopClient) {
      return;
    }

    let cancelled = false;

    void refreshAccounts().then(
      () => {
        if (!cancelled) {
          setError(null);
        }
      },
      (failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : "Failed to load site accounts");
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [desktopClient, initialAccounts]);

  return (
    <section style={pageStyles}>
      <header style={heroStyles}>
        <div style={copyStackStyles}>
          <p style={eyebrowStyles}>Accounts</p>
          <h2 style={headingStyles}>Site accounts and credential bundles</h2>
          <p style={copyStyles}>
            Sasiki keeps login capture, browser-plugin import, and credential verification in
            the main process so the renderer can stay focused on workflow control.
          </p>
        </div>
        <div style={summaryCardStyles}>
          <p style={summaryLabelStyles}>Account count</p>
          <strong style={summaryValueStyles}>{accounts.length}</strong>
        </div>
      </header>

      {error ? <p style={errorStyles}>{error}</p> : null}

        <AccountList
          accounts={accounts}
          onImportCookieFile={(siteAccountId) => {
            if (!desktopClient) {
              return;
            }
            void desktopClient.accounts.importCookieFile({ siteAccountId }).then(() => refreshAccounts());
          }}
          onLaunchEmbeddedLogin={(siteAccountId) => {
            if (!desktopClient) {
              return;
            }
            void desktopClient.accounts.launchEmbeddedLogin({ siteAccountId }).then(() => refreshAccounts());
          }}
          onVerifyCredential={(siteAccountId) => {
            if (!desktopClient) {
              return;
            }
            void desktopClient.accounts.verifyCredential({ siteAccountId }).then(() => refreshAccounts());
          }}
        />
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const errorStyles = {
  margin: 0,
  padding: "12px 14px",
  borderRadius: "16px",
  border: "1px solid rgba(161, 59, 59, 0.22)",
  background: "rgba(255, 245, 245, 0.9)",
  color: "#8c2f2f",
};
