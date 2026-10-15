export default function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p
      className={
        "mb-4 rounded-md px-3 py-2 text-sm " + (err ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")
      }
    >
      {decodeURIComponent(err ?? ok ?? "")}
    </p>
  );
}
