import { createAdminClient } from "@/lib/supabase/admin";
import LookupClient from "./LookupClient";

export default async function LookupPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("inquiry_url")
    .eq("id", campaignId)
    .single();

  return (
    <LookupClient campaignId={campaignId} inquiryUrl={campaign?.inquiry_url ?? null} />
  );
}
