"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StorageError({ reset }: { reset: () => void }) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="text-destructive size-10" />
      <h1 className="mt-4 text-xl font-semibold">Couldn’t load storage</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        PagePilot could not read your R2 storage information.
      </p>
      <Button className="mt-6" onClick={reset}>
        <RotateCcw /> Try again
      </Button>
    </section>
  );
}
