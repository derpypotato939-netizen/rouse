export {};

declare global {
  interface Window {
    /** Safari still exposes the prefixed constructor; needed for older iOS. */
    webkitAudioContext?: typeof AudioContext;
  }
}
