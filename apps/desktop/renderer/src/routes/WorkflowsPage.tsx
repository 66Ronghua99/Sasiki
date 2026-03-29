export function WorkflowsPage() {
  return (
    <section style={pageStyles}>
      <h2 style={headingStyles}>Workflows</h2>
      <p style={copyStyles}>
        Lane A keeps this surface intentionally thin while the runtime lane wires the
        actual observe, SOP compact, and refine execution paths.
      </p>
      <div style={gridStyles}>
        <article style={cardStyles}>
          <h3 style={cardHeadingStyles}>Observe</h3>
          <p style={cardCopyStyles}>Record a demonstration for a site account.</p>
        </article>
        <article style={cardStyles}>
          <h3 style={cardHeadingStyles}>SOP Compact</h3>
          <p style={cardCopyStyles}>Convert an observe run into a reusable SOP skill.</p>
        </article>
        <article style={cardStyles}>
          <h3 style={cardHeadingStyles}>Refine</h3>
          <p style={cardCopyStyles}>Execute a task with live run events and artifacts.</p>
        </article>
      </div>
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

const gridStyles = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
