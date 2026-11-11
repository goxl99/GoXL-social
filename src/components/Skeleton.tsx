/** Shown instantly while a page loads, so navigation feels immediate. */
export default function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="sk" style={{ width: 240, height: 28, marginBottom: 10 }} />
      <div className="sk" style={{ width: 360, height: 14, marginBottom: 22 }} />
      <div className="tiles" style={{ marginBottom: 16 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="sk" style={{ height: 82, borderRadius: 12 }} />)}</div>
      <div className="sk" style={{ height: 220, borderRadius: 12 }} />
    </div>
  );
}
