import { logoSvg } from "@/components/logo";

export const size = { width: 48, height: 48 };
export const contentType = "image/svg+xml";

export default function Icon() {
  return new Response(logoSvg(48, 10), {
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000" },
  });
}
