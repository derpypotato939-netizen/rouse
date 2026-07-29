import { ImageResponse } from "next/og";

/**
 * Favicon, generated rather than shipped as a binary.
 *
 * Three rising bars — the same idea as the waveform, legible at 32px where a wordmark would not be.
 * Replaces the create-next-app default, which on a live site reads as an abandoned scaffold.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0d12",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 3,
          padding: 6,
        }}
      >
        <div style={{ width: 5, height: "40%", background: "#4fd1c5", borderRadius: 999 }} />
        <div style={{ width: 5, height: "70%", background: "#ff7a45", borderRadius: 999 }} />
        <div style={{ width: 5, height: "95%", background: "#ff7a45", borderRadius: 999 }} />
      </div>
    ),
    size
  );
}
