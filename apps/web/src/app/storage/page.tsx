import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getStorageStats } from "@pagepilot/core/r2";
import { redirect } from "next/navigation";
import { Database, FileCode2, HardDrive, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteStorage } from "./delete-storage";
import { StorageChart } from "./storage-chart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Storage",
  robots: { index: false, follow: false },
};

const FREE_BYTES = 10 * 1024 ** 3;

export default async function StoragePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/storage");
  const storage = await getStorageStats();
  const usedPercent = Math.min((storage.bytes / FREE_BYTES) * 100, 100);

  return (
    <section className="py-10 sm:py-14">
      <div>
        <p className="text-brand-300 text-sm font-medium">Infrastructure</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Storage</h1>
        <p className="text-muted-foreground mt-2">
          Usage and controls for your PagePilot R2 vault.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric icon={FileCode2} label="Files" value={storage.files.toLocaleString()} />
        <Metric icon={HardDrive} label="HTML stored" value={formatBytes(storage.bytes)} />
        <Metric icon={Database} label="R2 bucket" value={storage.bucket} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Cloudflare R2</CardTitle>
            <Badge variant="secondary">Standard free tier</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-brand-500 h-full rounded-full"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-xs">
            <span>{formatBytes(storage.bytes)} used</span>
            <span>10 GB included monthly</span>
          </div>
          <div className="text-muted-foreground mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <span>1M Class A operations/month</span>
            <span>10M Class B operations/month</span>
            <span>Free internet egress</span>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            Free allowances apply to R2 Standard storage and reset monthly.
          </p>
        </CardContent>
      </Card>

      <StorageChart data={storage.history} />

      <Card className="border-destructive/30 mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Delete every HTML object under the PagePilot storage prefix. Published links
            stop working within a minute, once the edge cache expires. This cannot be
            undone.
          </p>
          <div className="mt-5">
            <DeleteStorage disabled={storage.files === 0} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileCode2;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="bg-brand-500/10 text-brand-300 flex size-10 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="mt-1 truncate font-medium">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)) - 1,
    units.length - 1,
  );
  return `${(bytes / 1024 ** (index + 1)).toFixed(index > 0 ? 2 : 1)} ${units[index]}`;
}
