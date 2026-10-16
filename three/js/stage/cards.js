// The three cards: their meshes, their faces and how they move each frame.
import * as THREE from 'three';
import { radialTexture } from './scene.js';
import { restFor } from './layout.js';

export function createCards(stage, rules, onFlip) {
  const { layout, motion, effects } = rules;
  const { cardW, cardH } = stage.view;

  // The back art is wider than a Thoth card: show its centre instead of squeezing it.
  const backTexture = stage.loadTexture('card-back.jpg');
  backTexture.repeat.x = cardW / cardH / (layout.back_px[0] / layout.back_px[1]);
  backTexture.offset.x = (1 - backTexture.repeat.x) / 2;

  const geometry = new THREE.BoxGeometry(cardW, cardH, 0.03);
  const edge = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
  const back = new THREE.MeshBasicMaterial({ map: backTexture });
  const glowTexture = radialTexture([[0, 'rgba(255,214,120,0.9)'], [0.45, 'rgba(224,33,138,0.28)'], [1, 'rgba(224,33,138,0)']]);

  // BoxGeometry material order: +x, -x, +y, -y, +z, -z. The back art faces the
  // camera (+z) until the card turns half a revolution and shows -z.
  const meshes = rules.spread.slots.map((_, slot) => {
    const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, back, new THREE.MeshBasicMaterial()]);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false,
    }));
    mesh.userData = { slot, card: null, open: false, flip: 0, moveAt: 0, restY: 0, spin: 1, glow, tilt: new THREE.Vector2() };
    stage.scene.add(glow, mesh);
    return mesh;
  });

  // Face-down again, each with the face of a newly drawn card.
  function setFaces(drawn) {
    meshes.forEach((mesh, i) => {
      const face = mesh.material[5];
      face.map?.dispose();
      face.map = stage.loadTexture(`thoth/${drawn[i].imageHd ?? drawn[i].image}`); // the redrawing when there is one, else the scan
      face.needsUpdate = true;
      Object.assign(mesh.userData, { card: drawn[i], open: false, flip: 0, glowFactor: 1 });
    });
  }

  // One full turn in place, for a card that is clicked with nothing left to reveal.
  function spin(mesh) {
    if (mesh.userData.spin >= 1) mesh.userData.spin = 0;
  }

  const raycaster = new THREE.Raycaster();
  function pick(pointer) {
    raycaster.setFromCamera(pointer, stage.camera);
    return raycaster.intersectObjects(meshes)[0]?.object ?? null;
  }

  const point = new THREE.Vector3();
  // frame: { dt, time, still, screen, shuffling, hovered, waiting, pointer }
  // Returns where each card's label belongs on screen, in pixels.
  function update(frame) {
    const { dt, time, still, pointer } = frame;
    const ease = still ? 1 : 1 - Math.exp(-dt * motion.ease_rate);

    return meshes.map((mesh, i) => {
      const data = mesh.userData;
      const rest = restFor(frame.screen, i, stage.view, layout, frame);
      const leaning = mesh === frame.hovered && !data.open;
      if (time >= data.moveAt) {
        mesh.position.x += (rest.x - mesh.position.x) * ease;
        data.restY += (rest.y - data.restY) * ease;
        mesh.scale.setScalar(mesh.scale.x + ((leaning ? 1.06 : 1) * rest.scale - mesh.scale.x) * ease);
        mesh.rotation.z += (rest.roll - mesh.rotation.z) * ease;
      }

      const before = data.flip, goal = data.open ? 1 : 0;
      data.flip = still ? goal : THREE.MathUtils.clamp(data.flip + (Math.sign(goal - data.flip) * dt) / motion.flip_seconds, 0, 1);
      if (!still && data.open && before < 0.5 && data.flip >= 0.5) onFlip(mesh);
      const turned = data.flip < 0.5 ? 4 * data.flip ** 3 : 1 - (-2 * data.flip + 2) ** 3 / 2;

      // a hovered card leans towards the pointer; a spread waiting for its reading sways
      data.tilt.x += ((leaning ? -pointer.y * 0.25 : 0) - data.tilt.x) * ease;
      data.tilt.y += ((leaning ? pointer.x * 0.35 : 0) - data.tilt.y) * ease;
      const sway = still ? 0 : (frame.waiting ? 0.18 : 0.04) * Math.sin(time * (frame.waiting ? 1.6 : 1.1) + i * 1.7);
      mesh.rotation.x = data.tilt.x;
      data.spin = still ? 1 : Math.min(1, data.spin + dt / motion.spin_seconds);
      const spun = data.spin < 0.5 ? 4 * data.spin ** 3 : 1 - (-2 * data.spin + 2) ** 3 / 2;
      mesh.rotation.y = (turned + 2 * spun) * Math.PI + data.tilt.y + (frame.waiting ? sway : 0);
      mesh.position.z = rest.z + (Math.sin(turned * Math.PI) * 0.8 + Math.sin(spun * Math.PI) * 0.5) * mesh.scale.x;
      mesh.position.y = data.restY + sway * 0.6 * mesh.scale.x;

      const shine = frame.waiting ? 0.45 + 0.3 * Math.sin(time * 3 + i * 2)
        : data.open ? effects.glow_open * data.glowFactor : leaning ? effects.glow_hover : 0;
      data.glow.material.opacity += (shine - data.glow.material.opacity) * ease;
      data.glow.position.set(mesh.position.x, mesh.position.y, mesh.position.z - 0.2);
      data.glow.scale.setScalar(mesh.scale.x * 3.6);

      // the label hangs from where the card rests, not from its bobbing, so it holds still to be clicked
      point.set(mesh.position.x, data.restY - (mesh.scale.x * cardH) / 2 - 0.16, 0).project(stage.camera);
      return { x: Math.round((point.x * 0.5 + 0.5) * innerWidth), y: Math.round((-point.y * 0.5 + 0.5) * innerHeight) };
    });
  }

  return { meshes, setFaces, spin, pick, update };
}
