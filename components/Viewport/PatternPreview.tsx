import React, { useEffect, useRef } from 'react';

interface PatternPreviewProps {
    type: 'solid' | 'grid' | 'checkerboard' | 'gradient' | 'voronoi' | 'sponge' | 'vascular' | 'lattice' | 'linear' | 'noise';
    cellSize: number; // mm
    shellGray?: number;
    coreGray?: number;
    width?: number;
    height?: number;
    power?: number;
    thickness?: number; // mm
    density?: number; // 0-1
}

export const PatternPreview: React.FC<PatternPreviewProps> = ({
    type,
    cellSize = 2.0,
    shellGray = 255,
    coreGray = 0,
    width = 150,
    height = 150,
    power = 1.0,
    thickness = 0.5,
    density = 0.5
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.error("WebGL not supported");
            return;
        }

        // Vertex Shader: Full-screen quad
        const vsSource = `
            attribute vec2 position;
            varying vec2 vUv;
            void main() {
                vUv = position * 0.5 + 0.5;
                vUv.y = 1.0 - vUv.y; // Flip Y
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        // Fragment Shader: Spongy Bone (Noise) replacement for Voronoi
        const fsSource = `
            precision highp float;
            varying vec2 vUv;
            uniform int uType; // 0=solid, 1=gradient, 2=voronoi/legacy, 3=sponge, 4=vascular, 5=lattice, 6=linear, 7=noise
            uniform float uCellSize; // mm
            uniform float uThickness; // mm
            uniform float uCoreGray;
            uniform float uShellGray;
            uniform float uPower;
            uniform float uDensity; // 0-1
            uniform vec2 uResolution;

            // Simple Hash for Noise
            vec2 hash( vec2 x ) {
                const vec2 k = vec2( 0.3183099, 0.3678794 );
                x = x*k + k.yx;
                return -1.0 + 2.0*fract( 16.0 * k*fract( x.x*x.y*(x.x+x.y)) );
            }

            // 2D Gradient Noise
            float noise( in vec2 p ) {
                vec2 i = floor( p );
                vec2 f = fract( p );
                vec2 u = f*f*(3.0-2.0*f);
                return mix( mix( dot( hash( i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ), 
                                 dot( hash( i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                            mix( dot( hash( i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ), 
                                 dot( hash( i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
            }

            void main() {
                vec2 uv = vUv;
                float gray = 0.0;

                if (uType == 0) { // Solid
                    gray = uCoreGray;
                } 
                else if (uType == 1) { // Radial Gradient
                    vec2 center = vec2(0.5);
                    float d = distance(uv, center) * 1.5; 
                    float radius = uCellSize / 10.0;
                    float t = clamp(d / radius, 0.0, 1.0);
                    gray = mix(uCoreGray, uShellGray, pow(t, uPower));
                }
                else if (uType == 2) { // Voronoi / Spongy (Legacy)
                     // This type is now unused or reserved for future Voronoi implementation
                     // For now, it will render solid core gray.
                     gray = uCoreGray;
                }
                else if (uType == 3) { // Sponge (New)
                     // Scale UV based on physical size (mm)
                    float previewSizeMM = 20.0; 
                    float scale = previewSizeMM / max(0.1, uCellSize);
                    
                    float n = noise(uv * scale);
                    n = n * 0.5 + 0.5;
                    
                    // Threshold derived from Density
                    // Density 1.0 = All Bone (Threshold 0)
                    // Density 0.0 = All Matrix (Threshold 1)
                    float threshold = 1.0 - uDensity;
                    
                    float val = smoothstep(threshold - 0.05, threshold + 0.05, n);
                    
                    // Mix between Matrix (Background) and Cell (Bone)
                    gray = mix(uShellGray, uCoreGray, val);
                }
                else if (uType == 4) { // Vascular
                    float previewSizeMM = 20.0; 
                    float scale = previewSizeMM / max(0.1, uCellSize);
                    
                    // Ridged noise: abs of noise creates sharp valleys at 0
                    float n = abs(noise(uv * scale));
                    
                    // We want valleys to be the "veins" (ShellGray/Void), 
                    // and everything else to be Tissue (CoreGray/Solid).
                    // Density controls the width of the veins.
                    float width = uDensity * 0.3; // 0 to 0.3 max width
                    float val = smoothstep(width - 0.02, width + 0.02, n);
                    
                    // val=0 in veins, val=1 in tissue
                    gray = mix(uShellGray, uCoreGray, val);
                }
                else if (uType == 5) { // Lattice
                    // Grid pattern preview matching python logic
                    // Cell size scaling
                    float previewSizeMM = 20.0; 
                    float scale = previewSizeMM / max(0.1, uCellSize);
                    
                    vec2 cell_uv = fract(uv * scale);
                    // Thickness is uDensity (0 to 1). If 0.2, then 20% of the cell is wall.
                    // We draw walls at the left and bottom edges of the cell
                    float wall_x = step(cell_uv.x, uDensity);
                    float wall_y = step(cell_uv.y, uDensity);
                    float val = max(wall_x, wall_y);
                    
                    // IF val=1 -> Wall -> CoreGray
                    // IF val=0 -> Void -> ShellGray
                    gray = mix(uShellGray, uCoreGray, val);
                }
                else if (uType == 6) { // Linear
                    float previewSizeMM = 20.0; 
                    float scale = previewSizeMM / max(0.1, uCellSize);
                    
                    vec2 cell_uv = fract(uv * scale);
                    float wall_x = step(cell_uv.x, uDensity);
                    
                    gray = mix(uShellGray, uCoreGray, wall_x);
                }
                else if (uType == 7) { // Pure static Noise
                    float n = hash(uv * 100.0); // very high freq
                    n = n * 0.5 + 0.5;
                    float val = step(1.0 - uDensity, n);
                    gray = mix(uShellGray, uCoreGray, val);
                }

                gl_FragColor = vec4(vec3(gray / 255.0), 1.0);
            }
        `;

        const compileShader = (source: string, type: number) => {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        };

        const program = gl.createProgram()!;
        const vs = compileShader(vsSource, gl.VERTEX_SHADER)!;
        const fs = compileShader(fsSource, gl.FRAGMENT_SHADER)!;
        if (!vs || !fs) return;

        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.useProgram(program);

        const vertices = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        // Uniforms
        const typeMap: Record<string, number> = { solid: 0, gradient: 1, voronoi: 2, sponge: 3, vascular: 4, lattice: 5, linear: 6, noise: 7, grid: 0, checkerboard: 0 };
        gl.uniform1i(gl.getUniformLocation(program, 'uType'), typeMap[type] ?? 0);
        gl.uniform1f(gl.getUniformLocation(program, 'uCellSize'), cellSize);
        gl.uniform1f(gl.getUniformLocation(program, 'uThickness'), thickness);
        gl.uniform1f(gl.getUniformLocation(program, 'uCoreGray'), coreGray);
        gl.uniform1f(gl.getUniformLocation(program, 'uShellGray'), shellGray);
        gl.uniform1f(gl.getUniformLocation(program, 'uPower'), power);
        gl.uniform1f(gl.getUniformLocation(program, 'uDensity'), density);
        gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), width, height);

        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        return () => {
            gl.deleteProgram(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            gl.deleteBuffer(buffer);
        };
    }, [type, cellSize, thickness, coreGray, shellGray, power, density, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="w-full h-auto bg-slate-900 rounded border border-slate-700 shadow-inner"
        />
    );
};
