"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CampaignListClient from "./CampaignListClient";
import StaffManagementClient from "./StaffManagementClient";
import NoshowManagementClient from "./NoshowManagementClient";
import DelegationBanner from "./DelegationBanner";
import TrialUsageBanner from "./TrialUsageBanner";

export default function AdminHomeClient() {
  const router = useRouter();
  const [tab, setTab] = useState<"campaigns" | "staff" | "noshow">("campaigns");

  async function logout() {
    if (!window.confirm("로그아웃할까요?")) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button onClick={logout} className="text-[12px] text-neutral-400 underline">
          로그아웃
        </button>
      </div>

      <DelegationBanner />
      <TrialUsageBanner />

      <div className="flex gap-1.5 mb-5 bg-neutral-100 rounded-lg p-1">
        <button
          onClick={() => setTab("campaigns")}
          className={`flex-1 text-[13px] py-2 rounded ${
            tab === "campaigns" ? "bg-white shadow-sm font-medium" : "text-neutral-500"
          }`}
        >
          공구 관리
        </button>
        <button
          onClick={() => setTab("staff")}
          className={`flex-1 text-[13px] py-2 rounded ${
            tab === "staff" ? "bg-white shadow-sm font-medium" : "text-neutral-500"
          }`}
        >
          배송담당자 관리
        </button>
        <button
          onClick={() => setTab("noshow")}
          className={`flex-1 text-[13px] py-2 rounded ${
            tab === "noshow" ? "bg-white shadow-sm font-medium" : "text-neutral-500"
          }`}
        >
          노쇼 관리
        </button>
      </div>

      {tab === "campaigns" && <CampaignListClient />}
      {tab === "staff" && <StaffManagementClient />}
      {tab === "noshow" && <NoshowManagementClient />}
    </div>
  );
}
