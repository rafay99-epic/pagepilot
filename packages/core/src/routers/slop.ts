import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { deploySlop, listSlops, deleteSlop } from "../r2";

export const slopRouter = router({
  deploy: protectedProcedure
    .input(
      z.object({
        html: z.string().min(1),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return deploySlop(input.html, input.title);
    }),

  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return listSlops(input.limit, input.cursor);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await deleteSlop(input.id);
      return { ok: true };
    }),
});
