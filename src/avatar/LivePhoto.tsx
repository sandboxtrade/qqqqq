import { useEffect, useRef, useState } from "react";
import type { AvatarVisualState } from "./visual-state";

// All landmark coordinates are in the original 1019 x 1536 photograph, never in screen pixels.
const vertexSource = `
attribute vec2 aUV;
varying vec2 vUV;
uniform vec2 uViewport;
uniform float uTime;
uniform float uMotion;
uniform float uBreath;
uniform float uSway;
uniform float uTiltBias;
uniform float uThinking;
float maskEllipse(vec2 p, vec2 center, vec2 radius) {
  vec2 q=(p-center)/radius;
  return 1.0-smoothstep(0.58,1.0,dot(q,q));
}
void main() {
  vUV=aUV;
  vec2 p=aUV*vec2(1019.0,1536.0);
  float head=maskEllipse(p,vec2(504.0,300.0),vec2(174.0,260.0));
  float torso=maskEllipse(p,vec2(495.0,635.0),vec2(235.0,285.0));
  float hand=maskEllipse(p,vec2(698.0,465.0),vec2(66.0,96.0));
  float breath=sin(uTime*1.12)*uBreath;
  float sway=sin(uTime*0.58)*uSway;
  float tilt=sin(uTime*0.43)*0.0055*uSway+uTiltBias;
  vec2 headMove=vec2(3.5*sway-(p.y-360.0)*tilt,(p.x-504.0)*tilt-1.8*breath);
  vec2 torsoMove=vec2((p.x-495.0)*0.0022*breath,-1.55*breath);
  vec2 handMove=vec2(1.15*sin(uTime*0.82)*uSway,-1.1*breath);
  vec2 movement=head*headMove+torso*torsoMove+hand*handMove;
  p+=movement*uMotion*(1.0+uThinking*0.08);
  float scale=max(uViewport.x/1019.0,uViewport.y/1536.0);
  vec2 size=vec2(1019.0,1536.0)*scale;
  vec2 offset=(uViewport-size)*vec2(0.5,0.12);
  vec2 screen=(p*scale+offset)/uViewport;
  gl_Position=vec4(screen.x*2.0-1.0,1.0-screen.y*2.0,0.0,1.0);
}`;

const fragmentSource = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uImage;
uniform float uBlink;
uniform float uRest;
vec3 eye(vec3 original,vec2 p,vec2 center,vec2 radius,float slope,vec3 skin) {
  vec2 d=p-center;
  d.y-=d.x*slope;
  vec2 q=d/radius;
  float area=1.0-smoothstep(0.82,1.12,dot(q,q));
  float close=max(smoothstep(0.2,0.92,uBlink),uRest);
  float lashY=0.20+0.23*(1.0-q.x*q.x);
  float lash=(1.0-smoothstep(0.065,0.145,abs(q.y-lashY)))*(1.0-smoothstep(0.80,1.02,abs(q.x)));
  vec3 lid=skin+vec3(0.035)*clamp(-q.y,0.0,1.0);
  lid=mix(lid,vec3(0.21,0.105,0.12),lash);
  return mix(original,lid,area*close);
}
void main(){
  vec3 color=texture2D(uImage,vUV).rgb;
  vec2 p=vUV*vec2(1019.0,1536.0);
  color=eye(color,p,vec2(465.0,248.0),vec2(34.0,18.0),0.12,vec3(0.925,0.675,0.647));
  color=eye(color,p,vec2(569.0,266.0),vec2(30.0,17.0),-0.15,vec3(0.917,0.645,0.633));
  gl_FragColor=vec4(color,1.0);
}`;

export function LivePhoto({
  src,
  visualState,
}: {
  src: string;
  visualState: AvatarVisualState;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const visual = useRef(visualState);
  const drawRef = useRef<(() => void) | null>(null);
  visual.current = visualState;
  const [fallback, setFallback] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    drawRef.current?.();
  }, [visualState]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [fallback]);

  useEffect(() => {
    setCanvasReady(false);
    if (fallback) return;
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    let stopped = false;
    let frame = 0;
    let lastFrame = 0;
    let time = 0;
    let nextBlink = 3 + Math.random() * 3;
    let blinkStart = -1;
    let ready = false;
    let painted = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const shaders: WebGLShader[] = [];
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind)!;
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader error");
      }
      return shader;
    };

    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    let observer: ResizeObserver | undefined;
    let visibility = () => {};
    const image = new Image();

    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "Shader link error");
      }
      gl.useProgram(program);

      const vertices: number[] = [];
      const cols = 36;
      const rows = 54;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          vertices.push(
            x / cols,
            y / rows,
            (x + 1) / cols,
            y / rows,
            x / cols,
            (y + 1) / rows,
            (x + 1) / cols,
            y / rows,
            (x + 1) / cols,
            (y + 1) / rows,
            x / cols,
            (y + 1) / rows,
          );
        }
      }
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      const attr = gl.getAttribLocation(program, "aUV");
      gl.enableVertexAttribArray(attr);
      gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const loc = {
        viewport: gl.getUniformLocation(program, "uViewport"),
        time: gl.getUniformLocation(program, "uTime"),
        motion: gl.getUniformLocation(program, "uMotion"),
        breath: gl.getUniformLocation(program, "uBreath"),
        sway: gl.getUniformLocation(program, "uSway"),
        tiltBias: gl.getUniformLocation(program, "uTiltBias"),
        blink: gl.getUniformLocation(program, "uBlink"),
        rest: gl.getUniformLocation(program, "uRest"),
        thinking: gl.getUniformLocation(program, "uThinking"),
      };

      const draw = () => {
        if (!ready || stopped) return;
        const dpr = Math.min(devicePixelRatio || 1, 1.75);
        const w = Math.round(canvas.clientWidth * dpr);
        const h = Math.round(canvas.clientHeight * dpr);
        if (!w || !h) return;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.uniform2f(loc.viewport, w, h);
        gl.uniform1f(loc.time, time);

        const state = visual.current;
        const motion = reduced.matches ? 0 : state.motion;
        gl.uniform1f(loc.motion, motion);
        gl.uniform1f(loc.breath, reduced.matches ? 0 : state.breath);
        gl.uniform1f(loc.sway, reduced.matches ? 0 : state.sway);
        gl.uniform1f(loc.tiltBias, reduced.matches ? 0 : state.tiltBias);
        gl.uniform1f(loc.rest, state.rest);
        gl.uniform1f(loc.thinking, reduced.matches ? 0 : state.thinking);

        let blink = 0;
        if (!reduced.matches && state.rest < 0.9) {
          if (time >= nextBlink) {
            blinkStart = time;
            nextBlink = time + 3.4 + Math.random() * 4.3;
          }
          const elapsed = time - blinkStart;
          if (blinkStart >= 0 && elapsed < 0.21) {
            blink = Math.sin((Math.PI * elapsed) / 0.21);
          }
        }
        gl.uniform1f(loc.blink, blink);
        gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
        if (!painted) { painted = true; setCanvasReady(true); }
      };
      drawRef.current = draw;

      const tick = (at: number) => {
        if (stopped || document.hidden) return;
        if (at - lastFrame >= 1000 / 30) {
          time += lastFrame ? Math.min((at - lastFrame) / 1000, 0.05) : 0;
          lastFrame = at;
          draw();
        }
        if (!reduced.matches) frame = requestAnimationFrame(tick);
      };
      const start = () => {
        cancelAnimationFrame(frame);
        lastFrame = 0;
        if (!document.hidden) {
          draw();
          if (!reduced.matches) frame = requestAnimationFrame(tick);
        }
      };

      visibility = start;
      document.addEventListener("visibilitychange", visibility);
      reduced.addEventListener("change", start);
      observer = new ResizeObserver(draw);
      observer.observe(canvas);

      image.onload = () => {
        if (stopped) return;
        try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          image,
        );
        ready = true;
        start();
        } catch { if (!stopped) setFallback(true); }
      };
      image.onerror = () => {
        if (!stopped) setFallback(true);
      };
      image.src = src;

      return () => {
        stopped = true;
        drawRef.current = null;
        cancelAnimationFrame(frame);
        observer?.disconnect();
        document.removeEventListener("visibilitychange", visibility);
        reduced.removeEventListener("change", start);
        image.onload = null;
        image.onerror = null;
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        shaders.forEach((shader) => gl.deleteShader(shader));
      };
    } catch {
      setFallback(true);
      drawRef.current = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      shaders.forEach((shader) => gl.deleteShader(shader));
    }

    return () => {
      stopped = true;
      drawRef.current = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", visibility);
      image.onload = null; image.onerror = null;
    };
  }, [src, fallback]);

  return fallback ? (
    <img className="photo-fallback" src={src} alt="Yuzuki" />
  ) : (
    <div className="live-photo-surface">
    <img className="photo-fallback" src={src} alt="" aria-hidden="true" />
    <canvas
      style={{ opacity: canvasReady ? 1 : 0 }}
      ref={ref}
      className="live-photo-canvas"
      role="img"
      aria-label="Yuzuki"
    />
    </div>
  );
}
