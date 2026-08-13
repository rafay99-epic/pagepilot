"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearStorage, type DeleteStorageState } from "./actions";

const initialState: DeleteStorageState = { status: "idle", message: "" };

export function DeleteStorage({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(clearStorage, initialState);

  if (!open) {
    return (
      <Button variant="destructive" onClick={() => setOpen(true)} disabled={disabled}>
        <Trash2 /> Delete all files
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="border-destructive/30 bg-destructive/5 mt-4 rounded-xl border p-4"
    >
      <p className="text-sm font-medium">
        This permanently deletes every PagePilot file.
      </p>
      <label className="text-muted-foreground mt-3 block text-sm">
        Type <strong className="text-foreground">DELETE ALL</strong> to confirm
        <input
          name="confirmation"
          autoComplete="off"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 mt-2 h-9 w-full rounded-lg border px-3 font-mono text-sm outline-none"
        />
      </label>
      {state.message && (
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-destructive mt-3 text-sm"
              : "mt-3 text-sm text-emerald-400"
          }
        >
          {state.message}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          {pending ? "Deleting…" : "Delete everything"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
