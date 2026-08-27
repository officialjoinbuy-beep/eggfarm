import { redirect } from "next/navigation";

// 공구 생성 폼은 /admin(목록 화면) 안으로 흡수됨.
// 기존 링크(/admin/new)로 들어오는 경우를 위해 그대로 안내.
export default function NewCampaignRedirect() {
  redirect("/admin");
}
