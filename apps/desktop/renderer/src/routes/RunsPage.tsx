export function RunsPage() {
  return (
    <section style={pageStyles}>
      <h2 style={headingStyles}>Runs</h2>
      <p style={copyStyles}>
        Live run state, logs, and artifact actions will land on top of the frozen
        `DesktopRunEvent` and `DesktopRunSummary` contracts from Lane A.
      </p>
      <article style={cardStyles}>
        <h3 style={cardHeadingStyles}>Parallel-safe placeholder</h3>
        <p style={cardCopyStyles}>
          Later runtime and renderer lanes can fill this page without changing the main
          window bootstrap or shared transport surface.
        </p>
      </article>
    </section>
  );
}

const pageStyles = {
  display: "grid",
  gap: "18px",
};

const headingStyles = {
  margin: 0,
  fontSize: "1.75rem",
};

const copyStyles = {
  margin: 0,
  maxWidth: "760px",
  lineHeight: 1.6,
};

const cardStyles = {
  padding: "20px",
  borderRadius: "20px",
  border: "1px solid rgba(92, 67, 48, 0.18)",
  background: "rgba(255, 255, 255, 0.8)",
  boxShadow: "0 18px 40px rgba(78, 60, 42, 0.08)",
};

const cardHeadingStyles = {
  margin: "0 0 8px",
  fontSize: "1.2rem",
};

const cardCopyStyles = {
  margin: 0,
  lineHeight: 1.5,
};
