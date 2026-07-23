import { NextResponse } from "next/server";
import { getSlopHtml } from "@pagepilot/core/r2";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const html = await getSlopHtml(id);

  if (!html) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(html, {
    headers: { "content-type": "text/html;charset=utf-8" },
  });
}
