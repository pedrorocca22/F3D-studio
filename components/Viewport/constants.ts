import * as THREE from 'three';

export const BUILD_VOLUME = {
  width: 100,    // X: bed width (mm)
  depth: 100,    // Y: bed depth (mm)  [Three.js Z axis]
  height: 100    // Z: max print height (mm) [Three.js Y axis]
};

export const SEGMENT_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f97316', // Orange
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#06b6d4', // Cyan
];

import { TOOLHEAD_COLORS } from '../../utils/toolheads';
export { TOOLHEAD_COLORS };

export const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
