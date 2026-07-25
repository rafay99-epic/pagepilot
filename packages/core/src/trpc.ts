import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export function createContext(opts: FetchCreateContextFnOptions) {
  return {
    authorization: opts.req.headers.get("authorization") || "",
  };
}

const t = initTRPC.context<typeof createContext>().create();

const authMiddleware = t.middleware(({ ctx, next }) => {
  const apiKey = ctx.authorization.replace("Bearer ", "");
  const expected = process.env.PAGEPILOT_API_KEY;

  if (!expected || apiKey !== expected) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});

export const router = t.router;
export const protectedProcedure = t.procedure.use(authMiddleware);
