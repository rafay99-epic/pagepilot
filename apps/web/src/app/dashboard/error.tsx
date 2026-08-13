"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-lg text-center">
        <CardContent className="py-8">
          <AlertTriangle className="text-destructive mx-auto size-10" />
          <h1 className="mt-4 text-xl font-semibold">Couldn’t load your pages</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            PagePilot couldn’t reach storage. Your files are safe; try the request again.
          </p>
          <Button className="mt-6" onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
