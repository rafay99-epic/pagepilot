import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { deploySlop, listSlops, deleteSlop, setShared } from "../r2";

export const slopRouter = router({
  deploy: protectedProcedure
    .input(
      z.object({
        html: z.string().min(1),
        title: z.string().optional(),
        share: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      return deploySlop(input.html, input.title, input.share);
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return listSlops(input.limit, input.cursor);
    }),

  setShared: protectedProcedure
    .input(z.object({ id: z.string().min(1), shared: z.boolean() }))
    .mutation(async ({ input }) => {
      return setShared(input.id, input.shared);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await deleteSlop(input.id);
      return { ok: true };
    }),
});
