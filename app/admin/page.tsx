import { redirect } from "next/navigation";
import { getRole } from "@/lib/auth";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const role = await getRole();
  if (!role) redirect("/login");
  if (role !== "admin") redirect("/");
  return <AdminClient />;
}
