import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { isAuthed } from "./auth";

export function createContext(opts: FetchCreateContextFnOptions) {
  return { authed: isAuthed(opts.req) };
}

const t = initTRPC.context<typeof createContext>().create();

const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.authed) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next();
});

export const router = t.router;
export const protectedProcedure = t.procedure.use(authMiddleware);
