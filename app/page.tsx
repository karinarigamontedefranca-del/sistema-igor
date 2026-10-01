import { redirect } from "next/navigation";
import { getRole } from "@/lib/auth";
import ReceptionClient from "./ReceptionClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const role = await getRole();
  if (!role) redirect("/login");
  return <ReceptionClient isAdmin={role === "admin"} />;
}
