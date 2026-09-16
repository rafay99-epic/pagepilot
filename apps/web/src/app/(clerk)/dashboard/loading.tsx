import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <section className="py-10 sm:py-14" aria-label="Loading dashboard">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-9 w-44" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <Card className="mt-8 gap-0 py-0">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="border-border flex items-center justify-between border-b px-5 py-6 last:border-0"
          >
            <div className="w-full max-w-lg">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-3 w-1/3" />
            </div>
            <Skeleton className="ml-6 h-8 w-28" />
          </div>
        ))}
      </Card>
    </section>
  );
}
