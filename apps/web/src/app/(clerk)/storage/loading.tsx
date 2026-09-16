import { Skeleton } from "@/components/ui/skeleton";

export default function StorageLoading() {
  return (
    <section className="py-10 sm:py-14" aria-label="Loading storage">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-40" />
      <Skeleton className="mt-3 h-5 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-44 rounded-xl" />
      <Skeleton className="mt-4 h-48 rounded-xl" />
    </section>
  );
}
