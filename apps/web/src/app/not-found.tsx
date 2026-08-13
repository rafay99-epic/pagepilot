import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BookOpen, FileQuestion } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The PagePilot page you requested could not be found.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="relative isolate -mx-4 flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden px-4 py-20 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-glow absolute inset-0 opacity-70" />
        <DotPattern
          width={24}
          height={24}
          cr={1}
          className={cn(
            "text-white/25",
            "[mask-image:radial-gradient(55%_50%_at_50%_45%,white,transparent)]",
          )}
        />
      </div>

      <Card className="bg-card/75 relative w-full max-w-xl overflow-hidden border-white/10 shadow-2xl shadow-black/25 backdrop-blur-xl">
        <span
          aria-hidden="true"
          className="text-brand-400/5 pointer-events-none absolute -right-5 -top-20 font-mono text-[13rem] font-semibold leading-none tracking-tighter sm:text-[16rem]"
        >
          404
        </span>

        <CardContent className="relative flex flex-col items-center px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="bg-brand-500/10 ring-brand-500/20 flex size-14 items-center justify-center rounded-2xl ring-1 ring-inset">
            <FileQuestion className="text-brand-300 size-7" aria-hidden="true" />
          </div>

          <p className="text-brand-300 mt-6 font-mono text-sm font-medium tracking-[0.2em]">
            ERROR 404
          </p>
          <h1
            id="not-found-title"
            className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            This page is off the flight path
          </h1>
          <p className="text-muted-foreground mt-4 max-w-md text-pretty leading-relaxed">
            The link may be outdated, the page may have been deleted, or the address may
            be incorrect.
          </p>

          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" className="h-10 rounded-xl px-5" asChild>
              <Link href="/">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to PagePilot
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-10 rounded-xl px-5" asChild>
              <Link href="/docs">
                <BookOpen className="size-4" aria-hidden="true" />
                Read the docs
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
