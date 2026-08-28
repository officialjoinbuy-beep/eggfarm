"use client";

import { useState } from "react";
import CampaignListClient from "./CampaignListClient";
import StaffManagementClient from "./StaffManagementClient";

export default function AdminHomeClient() {
  const [tab, setTab] = useState<"campaigns" | "staff">("campaigns");

  return (
    <div>
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
      </div>

      {tab === "campaigns" ? <CampaignListClient /> : <StaffManagementClient />}
    </div>
  );
}
