// Delivery-job lifecycle as a daisyUI stepper (a real sequence, so numbered steps fit).
const STEPS: [string, string[]][] = [
  ["Planned", ["PLANNING"]],
  ["Funded", ["AWAITING_FUNDING"]],
  ["Assigned", ["ASSIGNED", "ACCEPTED"]],
  ["Collected", ["AT_PICKUP", "COLLECTED"]],
  ["On the way", ["IN_TRANSIT"]],
  ["Delivered", ["DELIVERED"]],
  ["Received", ["COMPLETED", "PARTIALLY_COMPLETED"]],
];

export function JobSteps({ status, lastActive }: { status: string; lastActive?: string }) {
  const stopped = status === "FAILED" || status === "CANCELLED";
  // For a stopped job, show progress up to the last state it reached (from the audit trail when available).
  const ref = stopped ? lastActive ?? "PLANNING" : status;
  const idx = Math.max(0, STEPS.findIndex(([, s]) => s.includes(ref)));
  return (
    <div className="overflow-x-auto rounded-[1.25rem] border border-line/80 bg-white px-2 py-4 shadow-[var(--shadow-float)]">
      <ul className="d-steps w-full min-w-[560px] text-xs" aria-label="Delivery progress">
        {STEPS.map(([label], i) => {
          const done = i <= idx;
          const cls = stopped && i === idx + 1 ? "d-step d-step-error" : done ? "d-step d-step-success" : "d-step";
          const aria = i === idx && !stopped ? "step" : undefined;
          return (
            <li key={label} className={cls} aria-current={aria} data-content={stopped && i === idx + 1 ? "✕" : done ? "✓" : String(i + 1)}>
              {stopped && i === idx + 1 ? (status === "FAILED" ? "Failed" : "Cancelled") : label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
