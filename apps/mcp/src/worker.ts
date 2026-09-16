import { mcpHandler } from "@pagepilot/core/mcp";
import { isAuthed, unauthorized } from "@pagepilot/core/auth";

/**
 * The MCP endpoint on the same network as the R2 bucket it serves: no cold
 * starts, single-digit-millisecond storage calls, and no Vercel function in
 * the tool path. Same bearer key, same three tools, same both-era serving as
 * the Vercel route — both hosts import the one factory from @pagepilot/core.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (!isAuthed(request)) return unauthorized();
    return mcpHandler.fetch(request);
  },
};
