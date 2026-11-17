import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This record does not exist or is not visible from your current organisation.</p>
      <Link href="/dashboard" className="btn btn-primary mt-5">Back to your workspace</Link>
    </div>
  );
}
