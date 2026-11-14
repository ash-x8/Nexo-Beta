export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "error";

/** Mutable, non-reactive channel read every frame by the 3D avatar and waveform (avoids React re-renders at 60fps). */
export const avatarBus = {
  state: "idle" as AvatarState,
  /** 0..1 audio energy: measured from real generated audio, mic activity, or word-boundary pulses */
  level: 0
};
