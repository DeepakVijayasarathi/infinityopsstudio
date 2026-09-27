import {
  BarChart3,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mail,
  Megaphone,
  Palette,
  Plug,
  Search,
  Settings,
  Share2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/config/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; permission?: Permission; section: "main" | "grow" | "workspace" };

export const NAV: NavItem[] = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, section: "main" },
  { href: "/app/workers", label: "AI Workers", icon: Bot, permission: "workers:read", section: "main" },
  { href: "/app/campaigns", label: "Campaigns", icon: Megaphone, permission: "campaigns:read", section: "main" },
  { href: "/app/content", label: "Content Studio", icon: FileText, permission: "content:read", section: "main" },
  { href: "/app/social", label: "Social Media", icon: Share2, permission: "social:read", section: "grow" },
  { href: "/app/seo", label: "SEO", icon: Search, permission: "seo:read", section: "grow" },
  { href: "/app/email", label: "Email Marketing", icon: Mail, permission: "email:read", section: "grow" },
  { href: "/app/leads", label: "Leads", icon: Users, permission: "leads:read", section: "grow" },
  { href: "/app/automations", label: "Automations", icon: Workflow, permission: "automations:read", section: "grow" },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3, permission: "analytics:read", section: "grow" },
  { href: "/app/brand", label: "Brand Kit", icon: Palette, section: "workspace" },
  { href: "/app/integrations", label: "Integrations", icon: Plug, section: "workspace" },
  { href: "/app/billing", label: "Billing", icon: CreditCard, permission: "billing:view", section: "workspace" },
  { href: "/app/settings", label: "Settings", icon: Settings, section: "workspace" },
];

export const NAV_SECTIONS: { key: NavItem["section"]; label: string }[] = [
  { key: "main", label: "Workspace" },
  { key: "grow", label: "Growth" },
  { key: "workspace", label: "Manage" },
];

export function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
}
