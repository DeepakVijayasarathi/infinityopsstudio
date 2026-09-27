import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { contentOpportunities, listKeywords, listProjects, seoReport } from "@/server/services/seo";
import { PageHeader } from "@/components/ui/page-header";
import { SeoView } from "./seo-view";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requirePagePermission("seo:read");
  const ws = ctx.workspace.id;
  const projects = await listProjects(ws);
  const { project: pid } = await searchParams;
  const project = projects.find((p) => p.id === pid) ?? projects[0] ?? null;
  const [keywords, opportunities, report] = project
    ? await Promise.all([listKeywords(ws, project.id), contentOpportunities(ws), seoReport(ws, project.id)])
    : [[], [], null];
  return (
    <>
      <PageHeader title="SEO" description="Audit your site, track keywords and find content opportunities." />
      <SeoView
        projects={JSON.parse(JSON.stringify(projects))}
        project={project ? JSON.parse(JSON.stringify(project)) : null}
        keywords={JSON.parse(JSON.stringify(keywords))}
        opportunities={opportunities}
        report={report ? JSON.parse(JSON.stringify(report)) : null}
        canWrite={can(ctx, "seo:write")}
      />
    </>
  );
}
