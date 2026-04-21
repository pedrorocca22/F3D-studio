import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraManagerProps {
  viewTrigger: { mode: string; t: number };
  focusTarget: THREE.Vector3 | null;
}

export const CameraManager: React.FC<CameraManagerProps> = ({ viewTrigger, focusTarget }) => {
  const { camera, controls } = useThree();

  const desiredPos = useRef(new THREE.Vector3(100, 100, 150));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const isAnimating = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const { mode } = viewTrigger;
    const distance = 180;

    if (mode === 'iso') {
      desiredPos.current.set(100, 100, 150);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'top') {
      desiredPos.current.set(0, distance, 0.01);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'front') {
      desiredPos.current.set(0, 0, distance);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'right') {
      desiredPos.current.set(distance, 0, 0);
      desiredTarget.current.set(0, 0, 0);
    }

    isAnimating.current = true;
  }, [viewTrigger, controls]);

  useFrame((state, delta) => {
    if (!isAnimating.current || !controls) return;

    const orb = controls as any;
    const speed = 4 * delta;

    camera.position.lerp(desiredPos.current, speed);
    orb.target.lerp(desiredTarget.current, speed);
    orb.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.1 &&
      orb.target.distanceTo(desiredTarget.current) < 0.1
    ) {
      isAnimating.current = false;
    }
  });

  return null;
};
