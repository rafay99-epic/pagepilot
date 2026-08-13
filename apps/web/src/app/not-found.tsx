import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <FileQuestion className="text-muted-foreground size-12" />
      <p className="text-brand-300 mt-5 text-sm font-medium">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground mt-3 max-w-md">
        The page may have moved, expired, or never existed.
      </p>
      <Button className="mt-7" asChild>
        <Link href="/">Back home</Link>
      </Button>
    </section>
  );
}
