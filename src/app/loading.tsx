export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="skeleton h-8 w-64" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div>
      <div className="skeleton h-64" />
    </div>
  );
}
