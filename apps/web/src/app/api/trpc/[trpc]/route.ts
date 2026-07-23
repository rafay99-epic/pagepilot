import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@pagepilot/core/routers/_app";
import { createContext } from "@pagepilot/core/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
