import Link from "next/link";

export function BottomNav({ active }: { active: "home" | "buddy" | "progress" | "profile" }) {
  return <nav className="bottomNav">
    <Link className={active === "home" ? "active" : ""} href="/home">🏠 Today</Link>
    <Link className={active === "buddy" ? "active" : ""} href="/buddy">💬 Buddy</Link>
    <Link className={active === "progress" ? "active" : ""} href="/progress">📈 Progress</Link>
    <Link className={active === "profile" ? "active" : ""} href="/profile">👤 Profilo</Link>
  </nav>;
}
