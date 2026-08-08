import { ImageResponse } from "next/og";

export const alt = "Sentrys — Plateforme de gestion pour sociétés de sécurité privée";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #060912 0%, #0b1220 60%, #060912 100%)",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 28,
              background: "linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)",
            }}
          >
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2L4 5V11C4 16.55 7.16 21.74 12 23C16.84 21.74 20 16.55 20 11V5L12 2Z"
                fill="#060912"
              />
            </svg>
          </div>
          <span
            style={{
              fontSize: 88,
              fontWeight: 900,
              letterSpacing: -2,
              color: "#f8fafc",
              textTransform: "uppercase",
            }}
          >
            Sentrys
          </span>
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 34,
            fontWeight: 600,
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          La sécurité privée a enfin son système d'exploitation.
        </div>
      </div>
    ),
    { ...size }
  );
}
