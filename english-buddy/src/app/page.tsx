import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Page() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const result = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  redirect(result.rows.length ? "/home" : "/onboarding");
}
