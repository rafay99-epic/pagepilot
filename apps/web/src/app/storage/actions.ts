"use server";

import { auth } from "@clerk/nextjs/server";
import { deleteAllPages } from "@pagepilot/core/r2";
import { revalidatePath } from "next/cache";

export type DeleteStorageState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function clearStorage(
  _state: DeleteStorageState,
  formData: FormData,
): Promise<DeleteStorageState> {
  const { userId } = await auth();
  if (!userId) return error("Your session expired. Sign in again.");
  if (formData.get("confirmation") !== "DELETE ALL") {
    return error('Type "DELETE ALL" to confirm.');
  }

  try {
    const deleted = await deleteAllPages();
    revalidatePath("/dashboard");
    revalidatePath("/storage");
    return {
      status: "success",
      message: deleted
        ? `Deleted ${deleted} file${deleted === 1 ? "" : "s"}.`
        : "Storage is already empty.",
    };
  } catch (cause) {
    console.error("Failed to clear PagePilot storage", cause);
    return error(
      "Deletion did not finish. Some files may be gone; refresh and try again.",
    );
  }
}

const error = (message: string): DeleteStorageState => ({ status: "error", message });
