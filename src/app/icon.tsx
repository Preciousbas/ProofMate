import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab favicon — ledger-bars mark on dark plate. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141A21",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            width: 20,
            position: "relative",
          }}
        >
          <div style={{ width: 16, height: 3, background: "#C8D96F", borderRadius: 1 }} />
          <div style={{ width: 12, height: 3, background: "#8FA34A", borderRadius: 1 }} />
          <div style={{ width: 8, height: 3, background: "#5C7340", borderRadius: 1 }} />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: 2,
              height: 14,
              background: "#C8D96F",
              borderRadius: 1,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
