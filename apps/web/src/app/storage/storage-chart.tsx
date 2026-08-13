"use client";

import { useState } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Metric = "bytes" | "files";

const chartConfig = {
  bytes: { label: "Storage", color: "var(--color-brand-400)" },
  files: { label: "Files", color: "var(--color-brand-400)" },
} satisfies ChartConfig;

export function StorageChart({
  data,
}: {
  data: { date: string; bytes: number; files: number }[];
}) {
  const [metric, setMetric] = useState<Metric>("bytes");

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Storage trend</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Current files grouped by their last-modified date over 30 days.
            </p>
          </div>
          <ToggleGroup
            value={[metric]}
            onValueChange={(value) => {
              const next = value[0] as Metric | undefined;
              if (next) setMetric(next);
            }}
            aria-label="Storage chart metric"
            className="border-border bg-muted/40 flex w-fit rounded-lg border p-1"
          >
            <ChartToggle value="bytes">Storage</ChartToggle>
            <ChartToggle value="files">Files</ChartToggle>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 12 }}>
            <defs>
              <linearGradient id="storage-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={`var(--color-${metric})`}
                  stopOpacity={0.35}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${metric})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickFormatter={(value: string) =>
                new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })
              }
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(value: number) =>
                metric === "bytes" ? formatCompactBytes(value) : value.toLocaleString()
              }
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) =>
                    new Date(`${payload[0]?.payload.date}T00:00:00Z`).toLocaleDateString(
                      undefined,
                      { dateStyle: "medium", timeZone: "UTC" },
                    )
                  }
                  formatter={(value) => (
                    <div className="flex min-w-32 items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {metric === "bytes" ? "Storage" : "Files"}
                      </span>
                      <span className="font-mono font-medium">
                        {metric === "bytes"
                          ? formatBytes(Number(value))
                          : Number(value).toLocaleString()}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={`var(--color-${metric})`}
              strokeWidth={2.5}
              fill="url(#storage-fill)"
              animationDuration={350}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function ChartToggle({ value, children }: { value: Metric; children: React.ReactNode }) {
  return (
    <Toggle
      value={value}
      className="text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground rounded-md px-3 py-1.5 text-xs font-medium transition data-[pressed]:shadow-sm"
    >
      {children}
    </Toggle>
  );
}

function formatCompactBytes(bytes: number): string {
  if (!bytes) return "0";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
