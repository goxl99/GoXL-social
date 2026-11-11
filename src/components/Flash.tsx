export default async function Flash({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  if (err) return <div className="flash err" role="alert">{err}</div>;
  if (msg) return <div className="flash" role="status">{msg}</div>;
  return null;
}
