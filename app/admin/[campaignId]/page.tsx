import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./Dashboard";

export default async function AdminCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <main className="max-w-md mx-auto p-5 overflow-x-hidden">
      <Link href="/admin" className="text-[13px] text-neutral-500 mb-3 inline-block">
        ← 내 공구 목록
      </Link>
      <Dashboard campaignId={campaignId} />
    </main>
  );
}
