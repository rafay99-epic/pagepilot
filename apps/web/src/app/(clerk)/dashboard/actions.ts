"use server";

import { auth } from "@clerk/nextjs/server";
import { deletePage, deployPage, renamePage } from "@pagepilot/core/r2";
import { revalidatePath } from "next/cache";

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

async function requireUser(): Promise<boolean> {
  const { userId } = await auth();
  return !!userId;
}

export async function createPage(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireUser())) return error("Your session expired. Sign in again.");
  const title = String(formData.get("title") || "")
    .trim()
    .slice(0, 120);
  const html = String(formData.get("html") || "").trim();
  if (!title || !html) return error("Title and HTML are required.");
  if (Buffer.byteLength(html, "utf8") > 900_000) {
    return error("HTML must be smaller than 900 KB.");
  }
  try {
    await deployPage(html, title);
    revalidatePath("/dashboard");
    return success("Page published.");
  } catch (cause) {
    console.error("Failed to publish page", cause);
    return error("Could not publish the page. Please try again.");
  }
}

export async function removePage(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireUser())) return error("Your session expired. Sign in again.");
  const id = String(formData.get("id") || "");
  if (!/^[a-f0-9]{12}$/.test(id)) return error("Invalid page ID.");
  try {
    if (!(await deletePage(id))) return error("Page not found. Refresh and try again.");
    revalidatePath("/dashboard");
    return success("Page deleted.");
  } catch (cause) {
    console.error("Failed to delete page", { id, cause });
    return error("Could not delete the page. Please try again.");
  }
}

export async function updatePage(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireUser())) return error("Your session expired. Sign in again.");
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "")
    .trim()
    .slice(0, 120);
  if (!/^[a-f0-9]{12}$/.test(id) || !title) return error("Enter a valid title.");
  try {
    if (!(await renamePage(id, title)))
      return error("Page not found. Refresh and try again.");
    revalidatePath("/dashboard");
    return success("Title updated.");
  } catch (cause) {
    console.error("Failed to rename page", { id, cause });
    return error("Could not update the title. Please try again.");
  }
}

const success = (message: string): ActionState => ({ status: "success", message });
const error = (message: string): ActionState => ({ status: "error", message });
