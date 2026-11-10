"use client";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { avatarBus } from "@/lib/avatarBus";

export const MODEL_URL = "/models/assistant.glb";

interface Rig {
  meshes: THREE.Mesh[];
  head?: THREE.Object3D; neck?: THREE.Object3D; spine?: THREE.Object3D;
  eyeL?: THREE.Object3D; eyeR?: THREE.Object3D;
  base: Map<THREE.Object3D, THREE.Euler>;
  morphCount: number;
}

function buildRig(root: THREE.Object3D): Rig {
  const rig: Rig = { meshes: [], base: new Map(), morphCount: 0 };
  root.traverse((o) => {
    const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      if (m.morphTargetDictionary && m.morphTargetInfluences) { rig.meshes.push(m); rig.morphCount += Object.keys(m.morphTargetDictionary).length; }
    }
    if (!(o as THREE.Bone).isBone) return;
    if (!rig.head && /(^|mixamorig)head$/.test(n)) rig.head = o;
    else if (!rig.neck && /(^|mixamorig)neck$/.test(n)) rig.neck = o;
    else if (/(^|mixamorig)spine2$|^chest$|^upperchest$/.test(n)) rig.spine = o;
    else if (!rig.spine && /(^|mixamorig)spine1$/.test(n)) rig.spine = o;
    else if (/lefteye$|eyel$|eyeleft$/.test(n)) rig.eyeL = o;
    else if (/righteye$|eyer$|eyeright$/.test(n)) rig.eyeR = o;
  });
  [rig.head, rig.neck, rig.spine, rig.eyeL, rig.eyeR].forEach((b) => b && rig.base.set(b, b.rotation.clone()));
  return rig;
}

function setMorph(rig: Rig, name: string, target: number, k: number) {
  for (const m of rig.meshes) {
    const i = m.morphTargetDictionary![name];
    if (i !== undefined) m.morphTargetInfluences![i] = THREE.MathUtils.lerp(m.morphTargetInfluences![i], target, k);
  }
}
const hasMorph = (rig: Rig, name: string) => rig.meshes.some((m) => m.morphTargetDictionary![name] !== undefined);

function Model({ onInfo }: { onInfo: (morphs: number) => void }) {
  const { scene } = useGLTF(MODEL_URL);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const rig = useMemo(() => buildRig(scene), [scene]);
  const st = useMemo(() => ({ nextBlink: 1.5, blinkT: -1, gaze: new THREE.Vector2(), nextGaze: 0, gazeCur: new THREE.Vector2(), viseme: 0, lastLevel: 0 }), []);

  useEffect(() => {
    onInfo(rig.morphCount);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    camera.fov = 26;
    camera.position.set(0, box.max.y - h * 0.1, h * 0.36);
    camera.lookAt(0, box.max.y - h * 0.115, 0);
    camera.updateProjectionMatrix();
  }, [scene, rig, camera, onInfo]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent smoothing
    const mode = avatarBus.state;
    const level = avatarBus.level;
    const rot = (o: THREE.Object3D | undefined, x: number, y: number, z: number) => {
      if (!o) return;
      const b = rig.base.get(o)!;
      o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, b.x + x, k);
      o.rotation.y = THREE.MathUtils.lerp(o.rotation.y, b.y + y, k);
      o.rotation.z = THREE.MathUtils.lerp(o.rotation.z, b.z + z, k);
    };

    // breathing
    const breath = Math.sin(t * 1.5);
    rot(rig.spine, breath * 0.012, 0, 0);
    scene.position.y = breath * 0.0015;

    // head motion per state
    let hx = Math.sin(t * 0.5) * 0.02, hy = Math.sin(t * 0.37) * 0.05, hz = Math.sin(t * 0.29) * 0.015;
    if (mode === "listening") { hz += 0.06; hx += Math.sin(t * 2.2) * 0.02 - 0.02; }
    if (mode === "thinking") { hx -= 0.07; hy += 0.18; }
    if (mode === "speaking") { hx += level * 0.06 * Math.sin(t * 5); hy += Math.sin(t * 1.6) * 0.06; }
    rot(rig.neck, hx * 0.4, hy * 0.4, hz * 0.4);
    rot(rig.head, hx * 0.6, hy * 0.6, hz * 0.6);

    // eye saccades
    if (t > st.nextGaze) {
      st.nextGaze = t + 0.8 + Math.random() * 2.4;
      st.gaze.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.2);
      if (mode === "thinking") st.gaze.set(0.3, -0.15 + Math.random() * 0.1);
    }
    st.gazeCur.lerp(st.gaze, Math.min(1, dt * 12));
    rot(rig.eyeL, st.gazeCur.y, st.gazeCur.x, 0);
    rot(rig.eyeR, st.gazeCur.y, st.gazeCur.x, 0);

    // blinking
    if (st.blinkT < 0 && t > st.nextBlink) st.blinkT = 0;
    let blink = 0;
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      blink = Math.sin(Math.min(1, st.blinkT / 0.16) * Math.PI);
      if (st.blinkT > 0.16) { st.blinkT = -1; st.nextBlink = t + 2 + Math.random() * 3.5; }
    }
    setMorph(rig, "eyeBlinkLeft", blink, 0.7);
    setMorph(rig, "eyeBlinkRight", blink, 0.7);

    // expressions
    const smile = mode === "speaking" ? 0.25 : mode === "listening" ? 0.18 : 0.1;
    const brow = mode === "listening" ? 0.35 : mode === "thinking" ? 0.25 : 0.05;
    setMorph(rig, "mouthSmileLeft", smile, k);
    setMorph(rig, "mouthSmileRight", smile, k);
    setMorph(rig, "browInnerUp", brow, k);
    setMorph(rig, "browDownLeft", mode === "thinking" ? 0.15 : 0, k);
    setMorph(rig, "browDownRight", mode === "thinking" ? 0.15 : 0, k);

    // lip-sync from measured audio energy; rotate viseme shapes when the mouth re-opens
    const speaking = mode === "speaking" ? level : 0;
    if (speaking > 0.12 && st.lastLevel <= 0.12) st.viseme = (st.viseme + 1 + Math.floor(Math.random() * 2)) % 4;
    st.lastLevel = speaking;
    const open = Math.min(1, speaking * 1.2);
    const shapes = ["viseme_aa", "viseme_O", "viseme_E", "viseme_I"];
    shapes.forEach((s, i) => setMorph(rig, s, i === st.viseme ? open * 0.7 : 0, 0.45));
    setMorph(rig, "jawOpen", hasMorph(rig, "viseme_aa") ? open * 0.25 : open * 0.6, 0.5);
    setMorph(rig, "mouthFunnel", st.viseme === 1 ? open * 0.3 : 0, 0.4);
  });

  return <primitive object={scene} />;
}

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function Avatar3D({ onInfo, onFail }: { onInfo: (morphs: number) => void; onFail: () => void }) {
  return (
    <Boundary onFail={onFail}>
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: "high-performance", alpha: true }} camera={{ fov: 26, near: 0.05, far: 50 }}>
        <hemisphereLight args={["#bfe9ff", "#0a1430", 1.1]} />
        <directionalLight position={[1.5, 2, 2]} intensity={1.6} color="#ffffff" />
        <directionalLight position={[-2, 1, -1]} intensity={1.2} color="#22d3ee" />
        <Suspense fallback={null}>
          <Model onInfo={onInfo} />
        </Suspense>
      </Canvas>
    </Boundary>
  );
}
