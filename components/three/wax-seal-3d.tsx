"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  size?: number;
}

export function WaxSeal3D({ size = 52 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = size * 2; // 2x for retina
    const H = size * 2;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 50);
    camera.position.set(0, 0, 3.2);

    // Key light — warm from top-left
    const key = new THREE.DirectionalLight(0xffdfc0, 3.0);
    key.position.set(-1.5, 2.5, 3);
    scene.add(key);

    // Fill — cool right
    const fill = new THREE.DirectionalLight(0xaaccff, 0.6);
    fill.position.set(2, -1, 2);
    scene.add(fill);

    // Rim — crimson tinted from behind
    const rim = new THREE.DirectionalLight(0x8b1a1a, 0.8);
    rim.position.set(0, -3, -2);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(0xf4ecd8, 0.3));

    // --- WAX DISC ---
    const discGeo = new THREE.CylinderGeometry(1, 0.92, 0.22, 64, 1);
    const waxMat = new THREE.MeshStandardMaterial({
      color: 0x8b1a1a,
      roughness: 0.55,
      metalness: 0.08,
      envMapIntensity: 0.4,
    });
    const disc = new THREE.Mesh(discGeo, waxMat);
    disc.rotation.x = -Math.PI * 0.08;
    scene.add(disc);

    // Outer ring edge detail
    const ringGeo = new THREE.TorusGeometry(1.0, 0.04, 12, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x5e1010,
      roughness: 0.7,
      metalness: 0.05,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.09;
    ring.rotation.x = Math.PI / 2;
    disc.add(ring);

    // Inner dashed ring (decorative) — smaller torus
    const innerRingGeo = new THREE.TorusGeometry(0.72, 0.02, 8, 48);
    const innerRing = new THREE.Mesh(innerRingGeo, ringMat);
    innerRing.position.y = 0.10;
    innerRing.rotation.x = Math.PI / 2;
    disc.add(innerRing);

    // --- "M" TEXTURE on top face ---
    const tc = document.createElement("canvas");
    tc.width = 256;
    tc.height = 256;
    const ctx = tc.getContext("2d")!;

    // transparent base
    ctx.clearRect(0, 0, 256, 256);

    // "M" glyph — embossed lighter shade
    ctx.font = "italic 900 142px 'Georgia', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Slight shadow for depth
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = "rgba(180,60,60,0.85)";
    ctx.fillText("M", 128, 134);

    // Highlight pass
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255,200,180,0.35)";
    ctx.fillText("M", 126, 132);

    const mTexture = new THREE.CanvasTexture(tc);

    // Apply texture as color overlay on top face
    const topGeo = new THREE.CircleGeometry(0.94, 64);
    const topMat = new THREE.MeshStandardMaterial({
      map: mTexture,
      transparent: true,
      roughness: 0.6,
      metalness: 0.0,
      depthWrite: false,
    });
    const topFace = new THREE.Mesh(topGeo, topMat);
    topFace.position.y = 0.115;
    topFace.rotation.x = -Math.PI / 2;
    disc.add(topFace);

    // --- IDLE ANIMATION ---
    let animId: number;
    let t = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.012;

      // Slow Y rotation + gentle wobble
      disc.rotation.y = t * 0.4;
      disc.rotation.z = Math.sin(t * 0.7) * 0.06;
      disc.rotation.x = -Math.PI * 0.08 + Math.sin(t * 0.5) * 0.04;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      discGeo.dispose();
      waxMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      innerRingGeo.dispose();
      topGeo.dispose();
      topMat.dispose();
      mTexture.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        display: "block",
        borderRadius: "9999px",
      }}
    />
  );
}
