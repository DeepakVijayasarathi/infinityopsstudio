"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, FileText, FolderOpen, ImageIcon, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type F = { id: string; filename: string; mimeType: string; size: number; visibility: "PUBLIC" | "PRIVATE"; url: string; createdAt: string };

export function FilesView({ files, canUpload, maxMb }: { files: F[]; canUpload: boolean; maxMb: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [visibility, setVisibility] = React.useState<"PRIVATE" | "PUBLIC">("PUBLIC");

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    for (const file of Array.from(list)) {
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`${file.name} is larger than ${maxMb} MB`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("visibility", visibility);
      form.append("purpose", "asset");
      try {
        await api.upload("files", form);
        toast.success(`${file.name} uploaded`);
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <Card
          className="flex flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
        >
          <Upload className="size-7 text-muted-foreground" />
          <div>
            <p className="font-medium">Drop files here or browse</p>
            <p className="text-xs text-muted-foreground">PNG, JPG, GIF, WebP, PDF or CSV · up to {maxMb} MB · type verified by file contents</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "PRIVATE" | "PUBLIC")} aria-label="Visibility" className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              <option value="PUBLIC">Public asset (long-lived link)</option>
              <option value="PRIVATE">Private (15-minute signed links)</option>
            </select>
            <Button onClick={() => input.current?.click()} loading={busy}>
              Browse files
            </Button>
          </div>
          <input ref={input} type="file" multiple className="sr-only" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.csv,text/csv" onChange={(e) => upload(e.target.files)} />
        </Card>
      )}
      {files.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No files yet" description="Upload logos, images and documents to use in content, social posts and your Brand Kit." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {files.map((f) => (
            <Card key={f.id} className="flex items-center gap-3 p-3">
              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {f.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt="" className="size-full object-cover" />
                ) : f.mimeType === "application/pdf" ? (
                  <FileText className="size-5 text-muted-foreground" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {(f.size / 1024).toFixed(0)} KB · <TimeAgo date={f.createdAt} />
                </p>
                <Badge className="mt-1">{f.visibility === "PUBLIC" ? "Public" : "Private"}</Badge>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={`Copy link to ${f.filename}`} onClick={() => navigator.clipboard.writeText(new URL(f.url, window.location.origin).toString()).then(() => toast.success("Link copied"))}>
                <Copy />
              </Button>
              {canUpload && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${f.filename}`}
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete ${f.filename}?`, description: "Links to this file will stop working.", destructive: true, confirmLabel: "Delete" }))) return;
                    try {
                      await api.del(`files/${f.id}`);
                      toast.success("File deleted");
                      router.refresh();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
