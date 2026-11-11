"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { avatarBus, type AvatarState } from "@/lib/avatarBus";

/**
 * Procedural holographic AI core (no model file needed).
 * Reads avatarBus.state / avatarBus.level every frame, so React never re-renders at 60fps.
 *  idle      slow, calm blue
 *  listening violet, rings tighten, core breathes
 *  thinking  fast counter-rotation, particles swirl
 *  speaking  teal, core + rings pulse with the real audio level
 */
const PALETTE: Record<AvatarState, number> = {
  idle: 0x4aa8ff,
  listening: 0x8a6bff,
  thinking: 0xb58cff,
  speaking: 0x3df0d0
};

interface Props { onFail?: () => void }

export default function JarvisCore({ onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      onFail?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    camera.position.z = 6;

    const color = new THREE.Color(PALETTE.idle);
    const group = new THREE.Group();
    scene.add(group);

    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;

    // Wireframe lattice
    const lattice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: true, opacity: 0.55, ...additive })
    );
    group.add(lattice);

    // Inner glow core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 32),
      new THREE.MeshBasicMaterial({ color, opacity: 0.85, ...additive })
    );
    group.add(core);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 32, 32),
      new THREE.MeshBasicMaterial({ color, opacity: 0.12, ...additive })
    );
    group.add(halo);

    // Orbital rings
    const rings = [1.75, 2.05, 2.4].map((r, i) => {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012 + i * 0.004, 8, 160),
        new THREE.MeshBasicMaterial({ color, opacity: 0.7 - i * 0.15, ...additive })
      );
      m.rotation.set(Math.PI / 2 + i * 0.5, i * 0.7, 0);
      group.add(m);
      return m;
    });

    // Particle shell
    const N = 520;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const th = Math.random() * Math.PI * 2;
      const r = 2.7 + Math.random() * 0.5;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(th);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color, size: 0.035, opacity: 0.8, sizeAttenuation: true, ...additive });
    const points = new THREE.Points(pg, pm);
    group.add(points);

    const materials: THREE.Material[] = [
      lattice.material as THREE.Material, core.material as THREE.Material, halo.material as THREE.Material,
      pm, ...rings.map((r) => r.material as THREE.Material)
    ];

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = new THREE.Color();
    let speed = 1, pulse = 0, raf = 0, last = performance.now(), t = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      const s = avatarBus.state;
      const level = avatarBus.level;

      target.setHex(PALETTE[s]);
      color.lerp(target, Math.min(1, dt * 4));
      materials.forEach((m) => (m as THREE.MeshBasicMaterial).color.copy(color));

      const wantSpeed = s === "thinking" ? 3.2 : s === "listening" ? 1.4 : s === "speaking" ? 1.8 : 0.7;
      speed += (wantSpeed - speed) * Math.min(1, dt * 3);
      const motion = reduce ? 0.15 : 1;

      const wantPulse = s === "speaking" ? level : s === "listening" ? 0.25 + 0.2 * Math.sin(t * 3) : 0.08 * Math.sin(t * 1.5);
      pulse += (wantPulse - pulse) * Math.min(1, dt * 12);

      lattice.rotation.y += dt * 0.35 * speed * motion;
      lattice.rotation.x += dt * 0.15 * speed * motion;
      points.rotation.y -= dt * 0.08 * speed * motion;
      rings.forEach((r, i) => {
        r.rotation.z += dt * (0.3 + i * 0.22) * speed * motion * (i % 2 ? -1 : 1);
        r.scale.setScalar(1 + pulse * 0.08 * (i + 1) - (s === "listening" ? 0.05 : 0));
      });
      const k = 1 + pulse * 0.45;
      core.scale.setScalar(k);
      halo.scale.setScalar(1 + pulse * 0.7);
      (core.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.min(0.3, pulse * 0.5);
      group.rotation.x = 0.25;

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    // Stop drawing while the tab is hidden to save battery.
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", vis);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onFail]);

  return <div ref={hostRef} className="jarvis-core" aria-hidden="true" />;
}
