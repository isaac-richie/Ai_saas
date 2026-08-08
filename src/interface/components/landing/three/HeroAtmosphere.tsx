"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

/**
 * Atmospherics layered over the hero photograph.
 *
 * Deliberately restrained: the plate already supplies gear, lighting and depth,
 * so anything heavy here fights it. All this adds is the one thing a still
 * cannot have — air. Dust drifts through a soft shaft that tracks the pointer,
 * which is enough to make the frame read as live rather than as wallpaper.
 *
 * Two draw calls, no lights, no materials to shade, no assets.
 */

const WARM = new THREE.Color("#ffd2a1")
const COOL = new THREE.Color("#22d3ee")

// Light rakes in from upper-left, matching the key in all three plates.
const SHAFT_TILT = 0.62
const SHAFT_DIR = new THREE.Vector3(Math.sin(SHAFT_TILT), -Math.cos(SHAFT_TILT), 0).normalize()
const SHAFT_ORIGIN = new THREE.Vector3(-4.2, 3.4, -1)

/* ──────────────────────────────── dust motes ──────────────────────────────── */

const DUST_COUNT = 340

/**
 * Deterministic PRNG (mulberry32). `Math.random()` inside render/useMemo is
 * impure and reshuffles the field on every mount; a fixed seed means the dust
 * lands identically every load, so the composition can actually be art-directed
 * rather than re-rolled behind the headline each time.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const dustVertex = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSize;
  uniform vec3  uOrigin;
  uniform vec3  uDir;

  attribute float aSeed;
  attribute float aScale;

  varying float vGlow;

  void main() {
    vec3 p = position;

    // Each mote drifts on its own phase, so the field never resolves into a
    // single visible loop.
    float t = uTime * 0.055;
    p.x += sin(t * 1.5 + aSeed * 6.2831) * 0.5;
    p.y += cos(t * 1.1 + aSeed * 4.1) * 0.34;
    p.z += sin(t * 0.8 + aSeed * 2.7) * 0.38;

    // Motes only catch light inside the shaft.
    vec3 v = p - uOrigin;
    float along = max(dot(v, uDir), 0.0);
    float distToAxis = length(v - uDir * along);

    float coneR = 0.9 + along * 0.34;
    float inBeam = 1.0 - smoothstep(coneR * 0.15, coneR, distToAxis);
    float depthFade = 1.0 - smoothstep(1.0, 13.0, along);

    vGlow = clamp(inBeam * depthFade, 0.0, 1.0);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * (12.0 / -mv.z);
  }
`

const dustFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  varying float vGlow;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float sprite = pow(1.0 - smoothstep(0.0, 0.5, d), 2.4);
    vec3 color = mix(uCool, uWarm, vGlow);

    // Strays stay barely-there; lit motes carry the sparkle.
    float alpha = sprite * (0.05 + vGlow * 0.85);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

function DustMotes() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(DUST_COUNT * 3)
    const seeds = new Float32Array(DUST_COUNT)
    const scales = new Float32Array(DUST_COUNT)

    const rand = mulberry32(0x5eed1e)
    for (let i = 0; i < DUST_COUNT; i += 1) {
      positions[i * 3 + 0] = (rand() - 0.5) * 14
      positions[i * 3 + 1] = (rand() - 0.5) * 10
      positions[i * 3 + 2] = (rand() - 0.5) * 6 - 1
      seeds[i] = rand()
      scales[i] = 0.3 + rand() * 0.9
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1))
    return geo
  }, [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: 22 },
      uOrigin: { value: SHAFT_ORIGIN.clone() },
      uDir: { value: SHAFT_DIR.clone() },
      uWarm: { value: WARM.clone() },
      uCool: { value: COOL.clone() },
    }),
    []
  )

  useFrame((_, delta) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value += delta
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

/* ──────────────────────────────── light shaft ─────────────────────────────── */

const shaftVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * A single soft shaft on a billboarded quad. A cone would be more physical, but
 * over a photograph a flat gradient reads better — it never betrays its own
 * geometry at the edges, which is exactly what gives fake volumetrics away.
 */
const shaftFragment = /* glsl */ `
  precision highp float;

  uniform vec3  uColor;
  uniform float uTime;
  uniform float uIntensity;

  varying vec2 vUv;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }

  void main() {
    // Widen the shaft as it descends.
    float t = clamp(vUv.y, 0.0, 1.0);
    float halfWidth = mix(0.06, 0.42, 1.0 - t);

    float dx = abs(vUv.x - 0.5);
    float core = 1.0 - smoothstep(0.0, halfWidth, dx);
    core = pow(core, 1.7);

    // Fade out along the throw so it never ends on a hard line.
    float fall = pow(t, 1.25);

    // Drifting haze keeps the shaft from looking like a static gradient.
    float haze = noise(vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 0.04));
    haze = 0.78 + haze * 0.36;

    float alpha = core * fall * haze * uIntensity;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`

function LightShaft() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uColor: { value: WARM.clone() },
      uTime: { value: 0 },
      uIntensity: { value: 0.30 },
    }),
    []
  )

  useFrame((_, delta) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh position={[-1.5, 0.2, -2]} rotation={[0, 0, SHAFT_TILT]}>
      <planeGeometry args={[7, 13]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={shaftVertex}
        fragmentShader={shaftFragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ──────────────────────────────────── rig ─────────────────────────────────── */

export function HeroAtmosphere() {
  const rigRef = useRef<THREE.Group>(null)
  const eased = useRef({ x: 0, y: 0 })

  useFrame((state, delta) => {
    // Frame-rate independent easing toward the pointer.
    const k = 1 - Math.pow(0.002, delta)
    eased.current.x += (state.pointer.x - eased.current.x) * k
    eased.current.y += (state.pointer.y - eased.current.y) * k

    if (rigRef.current) {
      // Very small throw. This sits behind headline copy — it should register
      // as depth, not as an effect demanding attention.
      rigRef.current.position.x = eased.current.x * 0.42
      rigRef.current.position.y = eased.current.y * 0.22
    }
  })

  return (
    <group ref={rigRef}>
      <LightShaft />
      <DustMotes />
    </group>
  )
}
