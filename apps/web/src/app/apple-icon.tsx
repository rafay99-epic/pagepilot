import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // iOS applies its own rounding, so the mark is drawn square-edged here.
  const src = `data:image/svg+xml;base64,${Buffer.from(logoSvg(180, 0)).toString("base64")}`;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={180} height={180} alt="" />
    </div>,
    size,
  );
}
