import { redirect } from "next/navigation";
import { isConsoleAuthed } from "@/lib/console-auth";
import ConsoleClient from "./ConsoleClient";

export default async function ConsolePage() {
  if (!(await isConsoleAuthed())) {
    redirect("/console/login");
  }
  return (
    <main className="max-w-2xl mx-auto p-5">
      <ConsoleClient />
    </main>
  );
}
