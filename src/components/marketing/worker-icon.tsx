import { Compass, LineChart, Mail, Megaphone, PenLine, Rocket, Search, Share2, Bot, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Compass, PenLine, Share2, Search, Mail, Megaphone, LineChart, Rocket };

export function WorkerIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICONS[name]) || Bot;
  return <Icon className={className} />;
}
