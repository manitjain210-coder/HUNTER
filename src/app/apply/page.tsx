import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { ActionForm, Submit } from "@/components/form";
import { OrgFields } from "@/components/org-fields";
import { createOrgAction } from "@/app/actions/org";
import { Card, Notice, PageHeader } from "@/components/kit";

export const metadata = { title: "Register an organisation" };

export default async function Apply() {
  const a = await getActor();
  if (!a) redirect("/register?next=/apply");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Create an organisation" subtitle="Step 1: profile (saved as a draft). Step 2: documents and declaration. Step 3: manual review." />
      <Notice tone="blue">You will become the owner / point of contact. Pending, rejected or suspended organisations cannot publish tickets, list stock or accept donations. Private businesses cannot get donation access by choosing a charity category.</Notice>
      <Card className="mt-4">
        <ActionForm action={createOrgAction} className="space-y-6">
          <OrgFields t={null} />
          <Submit>Save draft and continue</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
