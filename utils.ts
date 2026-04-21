export function generateUUID(): string {
  // Try using the native crypto.randomUUID if available
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch (e) {
    // Ignore error and fall back
  }

  // Fallback implementation (RFC4122 version 4 compliant)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function generateBoxSTL(w: number, d: number, h: number): string {
  const x = w / 2, y = d / 2;
  const faces = [
    { n: "0 0 -1", tris: [[[-x, -y, 0], [x, y, 0], [x, -y, 0]], [[-x, -y, 0], [-x, y, 0], [x, y, 0]]] }, // Bottom
    { n: "0 0 1", tris: [[[-x, -y, h], [x, -y, h], [x, y, h]], [[-x, -y, h], [x, y, h], [-x, y, h]]] }, // Top
    { n: "-1 0 0", tris: [[[-x, -y, 0], [-x, y, 0], [-x, y, h]], [[-x, -y, 0], [-x, y, h], [-x, -y, h]]] }, // Front
    { n: "1 0 0", tris: [[[x, -y, 0], [x, -y, h], [x, y, h]], [[x, -y, 0], [x, y, h], [x, y, 0]]] }, // Back
    { n: "0 -1 0", tris: [[[-x, -y, 0], [-x, -y, h], [x, -y, h]], [[-x, -y, 0], [x, -y, h], [x, -y, 0]]] }, // Left
    { n: "0 1 0", tris: [[[-x, y, 0], [x, y, 0], [x, y, h]], [[-x, y, 0], [x, y, h], [-x, y, h]]] }  // Right
  ];

  let stl = "solid box\n";
  faces.forEach(face => {
    face.tris.forEach(tri => {
      stl += `  facet normal ${face.n}\n    outer loop\n`;
      tri.forEach(v => stl += `      vertex ${v[0]} ${v[1]} ${v[2]}\n`);
      stl += "    endloop\n  endfacet\n";
    });
  });
  stl += "endsolid box";
  return stl;
}

export function generateCylinderSTL(dia: number, h: number, segs: number = 32): string {
  const r = dia / 2;
  let stl = "solid cyl\n";
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * Math.PI * 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2;
    const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
    const x2 = Math.cos(a2) * r, y2 = Math.sin(a2) * r;
    
    // Normal for the side facet (average direction of vertices for smoother-ish look in flat shading)
    const midA = (a1 + a2) / 2;
    const nx = Math.cos(midA), ny = Math.sin(midA);

    // Bottom cap
    stl += `  facet normal 0 0 -1\n    outer loop\n      vertex 0 0 0\n      vertex ${x2} ${y2} 0\n      vertex ${x1} ${y1} 0\n    endloop\n  endfacet\n`;
    // Top cap
    stl += `  facet normal 0 0 1\n    outer loop\n      vertex 0 0 ${h}\n      vertex ${x1} ${y1} ${h}\n      vertex ${x2} ${y2} ${h}\n    endloop\n  endfacet\n`;
    // Side 1
    stl += `  facet normal ${nx} ${ny} 0\n    outer loop\n      vertex ${x1} ${y1} 0\n      vertex ${x2} ${y2} 0\n      vertex ${x2} ${y2} ${h}\n    endloop\n  endfacet\n`;
    // Side 2
    stl += `  facet normal ${nx} ${ny} 0\n    outer loop\n      vertex ${x1} ${y1} 0\n      vertex ${x2} ${y2} ${h}\n      vertex ${x1} ${y1} ${h}\n    endloop\n  endfacet\n`;
  }
  stl += "endsolid cyl";
  return stl;
}
