"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">Nothing was changed. {error.digest ? `Reference: ${error.digest}` : ""}</p>
      <button onClick={reset} className="btn btn-primary mt-5">Try again</button>
    </div>
  );
}
