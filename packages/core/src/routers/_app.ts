import { router } from "../trpc";
import { slopRouter } from "./slop";

export const appRouter = router({
  slop: slopRouter,
});

export type AppRouter = typeof appRouter;
