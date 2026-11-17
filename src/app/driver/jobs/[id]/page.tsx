import { redirect } from "next/navigation";

export default async function DriverJob({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/logistics/jobs/${(await params).id}`);
}
