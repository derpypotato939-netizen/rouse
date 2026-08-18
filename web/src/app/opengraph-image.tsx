import { ImageResponse } from "next/og";

/**
 * Social preview card.
 *
 * This page's entire job is to be shared — from a video description, a Discord message, an iMessage.
 * Without this the link previews as a blank rectangle, which is the difference between a click and
 * a scroll past.
 *
 * Drawn with plain divs rather than an image file so it stays in sync with the palette and needs no
 * binary asset in the repo. The waveform bars are a fixed, hand-picked envelope — a real render
 * would mean running the synth at request time for no visual gain.
 */
export const alt = "Rouse — the alarm your brain can't learn";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rising envelope with the ramp visible on the left, mirroring what the Sound Lab draws.
const BARS = [
  4, 5, 6, 6, 8, 9, 11, 13, 16, 19, 23, 27, 32, 28, 38, 33, 44, 39, 52, 46,
  61, 48, 70, 55, 78, 60, 88, 64, 95, 70, 100, 62, 92, 74, 86, 58, 97, 68,
  90, 55, 99, 72, 84, 60, 93, 66, 88, 52, 96, 70,
];
const RAMP_BARS = 14;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d12",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 24,
              letterSpacing: 10,
              color: "#8b93a5",
              display: "flex",
            }}
          >
            ROUSE
          </div>
          <div
            style={{
              fontSize: 88,
              color: "#f2f0ec",
              marginTop: 24,
              lineHeight: 1.05,
              display: "flex",
              maxWidth: 900,
            }}
          >
            The alarm your brain can&apos;t learn.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", height: 150, gap: 6 }}>
          {BARS.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: 999,
                background: i < RAMP_BARS ? "#4fd1c5" : "#ff7a45",
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: 30, color: "#8b93a5", display: "flex", maxWidth: 980 }}>
          An alarm that has never existed and will never repeat. Some are rare.
        </div>
      </div>
    ),
    size
  );
}
