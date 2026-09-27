import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { AdminShell } from "./admin-shell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · InfinityOps Studio" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.user.platformRole !== "SUPER_ADMIN") redirect("/app");
  return <AdminShell user={{ name: session.user.name, email: session.user.email }}>{children}</AdminShell>;
}
