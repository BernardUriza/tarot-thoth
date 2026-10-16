// Atmosphere: the starfield and the burst of sparks when a card turns.
import * as THREE from 'three';
import { radialTexture } from './scene.js';

export function createStars(scene, count) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 36;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 2] = -2 - Math.random() * 12;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf5deb3, size: 0.05, transparent: true, opacity: 0.7 }));
  scene.add(stars);

  // drifts slowly and slides a little against the pointer, for depth
  return (time, pointer, ease) => {
    stars.rotation.z = time * 0.01;
    stars.position.x += (-pointer.x * 0.5 - stars.position.x) * ease * 0.3;
    stars.position.y += (-pointer.y * 0.3 - stars.position.y) * ease * 0.3;
  };
}

// One pooled Points object. Blending is additive, so fading a spark is just
// darkening its colour: no per-particle alpha needed.
export function createSparks(scene, { spark_pool: pool, sparks_per_flip: perBurst }) {
  const positions = new Float32Array(pool * 3), colors = new Float32Array(pool * 3);
  const velocity = new Float32Array(pool * 3), life = new Float32Array(pool);
  let next = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.09, map: radialTexture([[0, '#fff'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]),
    vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  })));

  function burst(origin, scale) {
    for (let n = 0; n < perBurst; n++) {
      const i = next = (next + 1) % pool;
      const angle = Math.random() * Math.PI * 2, speed = (1.2 + Math.random() * 3.2) * scale;
      positions.set([origin.x, origin.y, origin.z + 0.2], i * 3);
      velocity.set([Math.cos(angle) * speed, Math.sin(angle) * speed, (Math.random() - 0.3) * 1.6], i * 3);
      life[i] = 0.6 + Math.random() * 0.6;
    }
  }

  function update(dt) {
    for (let i = 0; i < pool; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const fade = Math.max(life[i], 0) ** 1.5;
      for (let axis = 0; axis < 3; axis++) positions[i * 3 + axis] += velocity[i * 3 + axis] * dt;
      velocity[i * 3 + 1] -= 2.4 * dt;
      // gold drifting to magenta as it dies
      colors.set([fade, fade * (0.35 + 0.45 * fade), fade * (0.55 - 0.35 * fade)], i * 3);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  return { burst, update };
}
