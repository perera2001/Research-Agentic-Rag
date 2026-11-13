const labels = {
  uploaded: 'Uploaded',
  pending: 'Pending',
  processing: 'Processing',
  ready: 'Ready',
  completed: 'Completed',
  failed: 'Failed',
};

export default function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'pending'}`}>{labels[status] || status || 'Pending'}</span>;
}
