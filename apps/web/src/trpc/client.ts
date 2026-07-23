import type { AppRouter } from "@pagepilot/core/routers/_app";
import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
