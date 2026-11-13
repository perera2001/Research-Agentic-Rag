const sections = [
  ['abstract', 'Abstract'],
  ['problem_statement', 'Problem statement'],
  ['methodology', 'Methodology'],
  ['key_results', 'Key results'],
  ['conclusion', 'Conclusion'],
];

export default function SummaryContent({ summary }) {
  if (!summary) return <p className="muted">The structured summary is not available yet.</p>;
  return (
    <div className="summary-content">
      <div className="summary-lead">
        <h3>{summary.title || 'Untitled paper'}</h3>
        <p>{Array.isArray(summary.authors) && summary.authors.length ? summary.authors.join(', ') : 'Authors not stated'}</p>
      </div>
      {sections.map(([key, label]) => (
        <section className="summary-section" key={key}>
          <h4>{label}</h4>
          <p>{summary[key] || 'Not stated'}</p>
        </section>
      ))}
    </div>
  );
}
