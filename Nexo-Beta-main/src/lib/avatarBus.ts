export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

/** Mutable, non-reactive channel read every frame by the 3D avatar (avoids React re-renders at 60fps). */
export const avatarBus = {
  state: "idle" as AvatarState,
  /** 0..1 mouth energy: measured from real generated audio, or word-boundary pulses for browser voice */
  level: 0
};
