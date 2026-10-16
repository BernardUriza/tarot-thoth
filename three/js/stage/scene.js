// The canvas behind every screen: renderer, camera and the view it frames.
import * as THREE from 'three';
import { computeView } from './layout.js';

export function createStage(layout) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(layout.fov, 1, 0.1, 100);
  const stage = { renderer, scene, camera, view: computeView(innerWidth, innerHeight, layout) };

  const textures = new THREE.TextureLoader();
  stage.loadTexture = (url) => {
    const texture = textures.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  };

  stage.resize = () => {
    stage.view = computeView(innerWidth, innerHeight, layout);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = stage.view.aspect;
    camera.position.set(0, 0, stage.view.distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  stage.resize();
  addEventListener('resize', stage.resize);
  return stage;
}

// A soft round gradient, for glows and sparks.
export function radialTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
