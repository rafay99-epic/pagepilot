import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { listPages } from "@pagepilot/core/r2";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NewPageForm } from "./new-page-form";
import { PageRow } from "./page-row";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 24;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ trail?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/dashboard");

  const trail = decodeTrail((await searchParams).trail);
  const cursor = trail.at(-1);
  const { items, nextCursor } = await listPages(PAGE_SIZE, cursor);
  const pageNumber = trail.length + 1;

  return (
    <section className="py-10 sm:py-14">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-brand-300 text-sm font-medium">Your vault</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Pages</h1>
          <p className="text-muted-foreground mt-2">
            Open, copy, rename, or remove your published pages.
          </p>
        </div>
        <NewPageForm />
      </div>

      <Card className="mt-8 gap-0 py-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-20 text-center">
            <FileCode2 className="text-muted-foreground size-10" />
            <h2 className="mt-4 font-medium">No pages here</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {pageNumber === 1
                ? "Publish from your agent or create a new page."
                : "This page is empty. Go back to the previous page."}
            </p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((page) => (
              <PageRow key={page.id} {...page} />
            ))}
          </div>
        )}
      </Card>

      <nav className="mt-5 flex items-center justify-between" aria-label="Pagination">
        <p className="text-muted-foreground text-sm">Page {pageNumber}</p>
        <div className="flex gap-2">
          {pageNumber > 1 ? (
            <Button variant="outline" asChild>
              <Link href={pageHref(trail.slice(0, -1))}>
                <ChevronLeft /> Previous
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <ChevronLeft /> Previous
            </Button>
          )}
          {nextCursor ? (
            <Button variant="outline" asChild>
              <Link href={pageHref([...trail, nextCursor])}>
                Next <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Next <ChevronRight />
            </Button>
          )}
        </div>
      </nav>
    </section>
  );
}

function decodeTrail(value?: string): string[] {
  if (!value) return [];
  try {
    const trail = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !Array.isArray(trail) ||
      trail.length > 50 ||
      trail.some((cursor) => typeof cursor !== "string" || cursor.length > 2048)
    ) {
      notFound();
    }
    return trail;
  } catch {
    notFound();
  }
}

function pageHref(trail: string[]): string {
  return trail.length
    ? `/dashboard?trail=${Buffer.from(JSON.stringify(trail)).toString("base64url")}`
    : "/dashboard";
}
