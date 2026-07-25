import { NextResponse } from "next/server";
import { getSlopHtml, isSharedId } from "@pagepilot/core/r2";
import { isAuthed } from "@pagepilot/core/auth";

const notFound = () => new NextResponse("Not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Private pages answer 404, never 401: a wrong guess must not confirm that an
  // id exists. Checked before touching R2, so an unauthorised probe costs nothing.
  if (!isSharedId(id) && !isAuthed(request)) return notFound();

  const html = await getSlopHtml(id);
  if (!html) return notFound();

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      // Shared links leak by being forwarded and unfurled; they should still
      // never turn up in a search index.
      "x-robots-tag": "noindex, nofollow, noarchive",
      "cache-control": "private, no-store",
    },
  });
}
