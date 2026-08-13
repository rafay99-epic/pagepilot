"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPage, type ActionState } from "./actions";

const initialActionState: ActionState = { status: "idle", message: "" };

export function NewPageForm() {
  const [state, action, pending] = useActionState(createPage, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <details ref={detailsRef} className="group relative">
      <summary className="bg-primary text-primary-foreground hover:bg-primary/80 flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors">
        <Plus className="size-4" /> New page
      </summary>
      <form
        ref={formRef}
        action={action}
        className="border-border bg-card absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] space-y-4 rounded-xl border p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Create a page</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close new page form"
            title="Close"
            onClick={() => detailsRef.current?.removeAttribute("open")}
          >
            <X />
          </Button>
        </div>
        <label className="block text-sm font-medium">
          Title
          <input
            name="title"
            required
            maxLength={120}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 mt-2 h-9 w-full rounded-lg border px-3 outline-none"
          />
        </label>
        <label className="block text-sm font-medium">
          HTML
          <textarea
            name="html"
            required
            rows={10}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 mt-2 w-full rounded-lg border p-3 font-mono text-xs outline-none"
            placeholder="<!doctype html>…"
          />
        </label>
        {state.message && (
          <p
            aria-live="polite"
            className={
              state.status === "error"
                ? "text-destructive text-sm"
                : "flex items-center gap-2 text-sm text-emerald-400"
            }
          >
            {state.status === "success" && <CheckCircle2 className="size-4" />}
            {state.message}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {pending ? "Publishing…" : "Publish page"}
        </Button>
      </form>
    </details>
  );
}
