import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isConsoleAuthed } from "@/lib/console-auth";
import KakaoSetupClient from "./KakaoSetupClient";

export default async function KakaoSetupPage() {
  if (!(await isConsoleAuthed())) {
    redirect("/console/login");
  }
  return (
    <main className="max-w-md mx-auto p-5">
      <Suspense fallback={null}>
        <KakaoSetupClient />
      </Suspense>
    </main>
  );
}
