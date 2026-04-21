import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface SceneControlsProps {
  cameraMode: 'orbit' | 'pan';
  zoomTrigger: number;
}

export const SceneControls: React.FC<SceneControlsProps> = ({ cameraMode, zoomTrigger }) => {
  const { camera } = useThree();
  const prevZoomRef = useRef(zoomTrigger);

  useEffect(() => {
    if (prevZoomRef.current !== zoomTrigger) {
      const delta = zoomTrigger - prevZoomRef.current;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      camera.position.addScaledVector(direction, delta * 20);
      prevZoomRef.current = zoomTrigger;
    }
  }, [zoomTrigger, camera]);

  const orbitProps = {
    enableRotate: cameraMode === 'orbit',
    mouseButtons: cameraMode === 'pan'
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  } as any;

  return <OrbitControls makeDefault enableDamping dampingFactor={0.1} {...orbitProps} />;
};
