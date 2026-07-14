import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — larger ledger-bars mark. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1419",
        }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 28,
            background: "#141A21",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: 78,
              position: "relative",
            }}
          >
            <div
              style={{ width: 62, height: 12, background: "#C8D96F", borderRadius: 3 }}
            />
            <div
              style={{ width: 48, height: 12, background: "#8FA34A", borderRadius: 3 }}
            />
            <div
              style={{ width: 32, height: 12, background: "#5C7340", borderRadius: 3 }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 8,
                height: 56,
                background: "#C8D96F",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}