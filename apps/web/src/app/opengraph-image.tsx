import { ImageResponse } from "next/og";
import { logoSvg } from "@/components/logo";
import { site } from "@/lib/site";

export const alt = `${site.name} — private HTML vault for AI agents`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const src = `data:image/svg+xml;base64,${Buffer.from(logoSvg(112, 12)).toString("base64")}`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#0b0b12",
        backgroundImage:
          "radial-gradient(60% 60% at 20% 0%, #4f46e566 0%, transparent 70%), radial-gradient(50% 50% at 90% 100%, #818cf833 0%, transparent 70%)",
        color: "#fafafa",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={112} height={112} alt="" />
      <div style={{ marginTop: 40, fontSize: 68, fontWeight: 700, letterSpacing: -2 }}>
        Your AI agent builds it.
      </div>
      <div style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2, color: "#a5b4fc" }}>
        PagePilot deploys it.
      </div>
      <div style={{ marginTop: 28, fontSize: 30, color: "#a1a1aa" }}>
        One hosted MCP endpoint · your own Cloudflare R2 bucket
      </div>
    </div>,
    size,
  );
}
