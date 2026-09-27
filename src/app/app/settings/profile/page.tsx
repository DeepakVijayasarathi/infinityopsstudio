import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { getSession } from "@/server/auth/session";
import { getProfile, listSessions } from "@/server/services/users";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Profile & security" };

export default async function ProfilePage() {
  const ctx = await requireContext();
  const session = (await getSession())!;
  const [profile, sessions] = await Promise.all([getProfile(ctx.user.id), listSessions(ctx.user.id, session.session.id)]);
  return <ProfileView profile={JSON.parse(JSON.stringify(profile))} sessions={JSON.parse(JSON.stringify(sessions))} />;
}
