"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface PaperScrap {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vr: number;
  phase: number;
}

export function PaperBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );
    camera.position.z = 10;

    // Warm key light
    const dirLight = new THREE.DirectionalLight(0xfff3d6, 1.4);
    dirLight.position.set(3, 6, 8);
    scene.add(dirLight);

    // Cool fill from opposite side
    const fillLight = new THREE.DirectionalLight(0xd6e8f0, 0.35);
    fillLight.position.set(-4, -3, 4);
    scene.add(fillLight);

    scene.add(new THREE.AmbientLight(0xf4ecd8, 0.5));

    // --- PAPER SCRAPS ---
    const scraps: PaperScrap[] = [];
    const paperColors = [0xf4ecd8, 0xebe0c2, 0xdfd1ad, 0xf8f0e0, 0xe8dcc8];

    const scrapCount = Math.min(28, Math.floor(window.innerWidth / 50));
    for (let i = 0; i < scrapCount; i++) {
      const w = 0.5 + Math.random() * 1.4;
      const h = w * (1.2 + Math.random() * 0.6);
      const geo = new THREE.PlaneGeometry(w, h);

      const col = paperColors[Math.floor(Math.random() * paperColors.length)];
      const mat = new THREE.MeshLambertMaterial({
        color: col,
        transparent: true,
        opacity: 0.12 + Math.random() * 0.18,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 18,
        -2 - Math.random() * 10
      );
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      scene.add(mesh);
      scraps.push({
        mesh,
        vx: (Math.random() - 0.5) * 0.006,
        vy: -0.004 - Math.random() * 0.006,
        vr: (Math.random() - 0.5) * 0.003,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // --- DUST MOTES ---
    const MOTES = 900;
    const motePositions = new Float32Array(MOTES * 3);
    const motePhases = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      motePositions[i * 3] = (Math.random() - 0.5) * 40;
      motePositions[i * 3 + 1] = (Math.random() - 0.5) * 26;
      motePositions[i * 3 + 2] = -1 - Math.random() * 16;
      motePhases[i] = Math.random() * Math.PI * 2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
    const moteMat = new THREE.PointsMaterial({
      color: 0x8b1a1a,
      size: 0.025,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    // --- MOUSE PARALLAX ---
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mouse.tx = ((e.clientX / window.innerWidth) - 0.5) * 0.6;
      mouse.ty = -((e.clientY / window.innerHeight) - 0.5) * 0.4;
    };
    window.addEventListener("mousemove", onMouseMove);

    // --- ANIMATION ---
    let animId: number;
    let t = 0;
    const BOUNDS_X = 16;
    const BOUNDS_Y = 11;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.008;

      // Parallax camera drift
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      camera.position.x = mouse.x;
      camera.position.y = mouse.y;
      camera.lookAt(0, 0, 0);

      // Paper scraps
      for (const s of scraps) {
        s.mesh.position.y += s.vy + Math.sin(t * 0.6 + s.phase) * 0.003;
        s.mesh.position.x += s.vx + Math.cos(t * 0.4 + s.phase) * 0.002;
        s.mesh.rotation.z += s.vr;
        s.mesh.rotation.x += s.vr * 0.5;

        // Wrap
        if (s.mesh.position.y < -BOUNDS_Y - 2) s.mesh.position.y = BOUNDS_Y + 2;
        if (s.mesh.position.x < -BOUNDS_X - 2) s.mesh.position.x = BOUNDS_X + 2;
        if (s.mesh.position.x > BOUNDS_X + 2) s.mesh.position.x = -BOUNDS_X - 2;
      }

      // Motes — subtle vertical drift
      const pos = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MOTES; i++) {
        pos.array[i * 3 + 1] += 0.003 + Math.sin(t + motePhases[i]) * 0.002;
        if (pos.array[i * 3 + 1] > 14) pos.array[i * 3 + 1] = -14;
      }
      pos.needsUpdate = true;

      // Motes gentle rotation
      motes.rotation.y = Math.sin(t * 0.05) * 0.04;

      renderer.render(scene, camera);
    };
    animate();

    // --- RESIZE ---
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      for (const s of scraps) {
        (s.mesh.geometry as THREE.PlaneGeometry).dispose();
        (s.mesh.material as THREE.MeshLambertMaterial).dispose();
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        width: "100vw",
        height: "100vh",
      }}
    />
  );
}
