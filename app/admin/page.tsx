import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignListClient from "./CampaignListClient";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <CampaignListClient />
    </main>
  );
}
