import * as THREE from 'three';
import type { PlanetLayer, SunLayer } from '../core/layers';
import { kelvinToRgb } from '../core/blackbody';
import { NoiseCubemap } from './NoiseCubemap';
import { NOISE_COMMON } from './noiseGlsl';
import { PLUME_VERT } from './plumeGlsl';

// Built-in bodies are functions of surface coordinates, not canvas bakes.
// Derivative coverage follows the actual preview/export pixel footprint.
const BODY_FRAG = /* glsl */ `${NOISE_COMMON}
uniform bool bodySun;
uniform vec4 bodyShape;
uniform vec4 bodySurface;
uniform vec4 bodyEnvironment;
uniform vec4 bodyRings;
uniform vec3 bodyColor;
uniform vec3 bodySecond;
uniform vec3 bodyAtmosphere;
uniform vec3 bodyRingColor;

void main() {
  vec2 uv = vertexPos.xy;
  vec2 p = (uv - 0.5) / bodyShape.x;
  // Match the canvas author's downward-positive Y convention.
  p.y = -p.y;
  float r = length(p);
  float aa = max(fwidth(r), 0.000001);
  float cover = 1.0 - smoothstep(1.0-aa, 1.0+aa, r);
  vec3 color = vec3(0.0);
  float alpha = cover;
  if (bodySun) {
    float mu = sqrt(max(0.0, 1.0-min(1.0,r*r)));
    float grain = fbmNoise(vec3(p * 14.0, 0.7), 4, 2.1, 0.55);
    float brightness = (1.0-bodyShape.y*(1.0-mu)) * (1.0+grain*0.22*bodyShape.z);
    color = mix(bodyColor, vec3(1.0), 0.55*mu*bodyShape.w) * brightness * cover;
    vec2 angle = p / max(r, 0.000001);
    float lobes = abs(fbmNoise(vec3(angle*2.3+vec2(7.1,0.0),0.5),4,2.0,0.55));
    float outside = max(0.0,r-1.0);
    float corona = bodyEnvironment.x * exp(-outside/max(0.05,bodyEnvironment.y*(0.25+1.5*lobes)*0.45));
    float halo = bodyEnvironment.w*0.6*exp(-pow(outside/2.4,1.3));
    float arc = fbmNoise(vec3(angle*3.7+vec2(0.0,51.3),0.9),3,2.0,0.5);
    float prominence = max(0.0,arc-(1.0-bodyEnvironment.z*0.55))*exp(-pow((r-1.06)/0.07,2.0))*3.2;
    vec3 environment = corona*(0.35+0.65*lobes)*mix(vec3(0.6,0.6,0.62),vec3(1.0),bodyColor)
      + halo*bodyColor + prominence*vec3(1.0,0.25,0.18);
    float window = 1.0-smoothstep(0.72,1.0,length((uv-0.5)*2.0));
    color += environment*(1.0-cover)*window;
    alpha = max(cover,max(color.r,max(color.g,color.b)));
  } else {
    float z = sqrt(max(0.0,1.0-min(1.0,r*r)));
    vec3 sphere = vec3(p,z);
    float n = fbmNoise(sphere*bodySurface.x,int(bodySurface.y),2.0,0.5)*0.5+0.5;
    float bands = 0.5+0.5*sin(p.y*9.0+n*5.0);
    n = mix(n,bands,bodySurface.z);
    vec3 light = vec3(cos(bodySurface.w)*0.85,-sin(bodySurface.w)*0.85,0.53);
    float shade = 0.06+0.94*pow(max(0.0,dot(sphere,light)),1.1);
    color = mix(bodyColor,bodySecond,clamp(n*1.4-0.2,0.0,1.0))*shade*cover;
    // A continuous atmospheric rim, filtered at the output pixel size.
    float atmosphere = bodyEnvironment.x > 0.0 ? exp(-pow((r-1.0)/max(bodyEnvironment.x,aa),2.0))*0.4 : 0.0;
    color = vec3(1.0)-(vec3(1.0)-color)*(vec3(1.0)-bodyAtmosphere*atmosphere);
    alpha = max(alpha,max(color.r,max(color.g,color.b)));
    if (bodyRings.x > 0.0) {
      float ringRadius = length(vec2(p.x,p.y/bodyRings.w));
      float ringAA = max(fwidth(ringRadius),0.000001);
      float ringCover = smoothstep(bodyRings.y-ringAA,bodyRings.y+ringAA,ringRadius)
        * (1.0-smoothstep(bodyRings.z-ringAA,bodyRings.z+ringAA,ringRadius));
      float t = (ringRadius-bodyRings.y)/max(0.0001,bodyRings.z-bodyRings.y);
      float band = fbmNoise(vec3(t*5.2+17.3,8.8,0.5),3,2.0,0.5)*0.5+0.5;
      float opacity = clamp(bodyRings.x*max(0.0,band*1.35-0.25),0.0,1.0)*ringCover;
      // Far half behind the opaque body; near half passes in front.
      if (p.y < 0.0) opacity *= 1.0-cover;
      color = mix(color,bodyRingColor,opacity);
      alpha = max(alpha,opacity);
    }
    float window = 1.0-smoothstep(0.96,1.0,max(abs(uv.x-0.5),abs(uv.y-0.5))*2.0);
    color *= window; alpha *= window;
  }
  color = pow(max(vec3(0.0),color),vec3(hdrPowerAmt))*hdrMultiplierAmt;
  fragColor = vec4(color,clamp(alpha,0.0,1.0));
}
`;

export function nativeBodyMaterial(layer: SunLayer | PlanetLayer) {
  // Reuse the seeded permutation/gradient resources without rendering a cube.
  const resources = new NoiseCubemap(1);
  resources.configure({ seed: (layer.seed + 0xb0d1) >>> 0, noiseType: 'fbm', innerColor: {r:1,g:1,b:1,a:1}, outerColor: {r:0,g:0,b:0,a:1}, octaves: 4, gain: 0.5, lacunarity: 2, offset: 1, scale: 1, powerAmount: 1, shelfAmount: 0, ditherAmount: 0, warpStrength: 0, warpScale: 1 });
  const material = resources.directMaterial;
  material.vertexShader = PLUME_VERT; material.fragmentShader = BODY_FRAG;
  material.side = THREE.DoubleSide;
  material.name = `Native ${layer.type} surface`;
  const u = material.uniforms;
  u.bodySun = { value: layer.type === 'sun' };
  const vector = (name: string, ...values: [number,number,number,number]) => { u[name] = { value: new THREE.Vector4(...values) }; };
  const color = (name: string, value: {r:number;g:number;b:number}) => { u[name] = { value: new THREE.Vector3(value.r,value.g,value.b) }; };
  vector('bodyShape',0.16,0,0,0); vector('bodySurface',1,4,0,0); vector('bodyEnvironment',0,0,0,0); vector('bodyRings',0,1,2,1);
  color('bodyColor',{r:1,g:1,b:1}); color('bodySecond',{r:1,g:1,b:1}); color('bodyAtmosphere',{r:0,g:0,b:0}); color('bodyRingColor',{r:0,g:0,b:0});
  if (layer.type === 'sun') {
    vector('bodyShape',0.16,layer.limbDarkening,layer.granulation,layer.kelvin<5200 ? Math.min(1,layer.kelvin/6000) : 1);
    vector('bodyEnvironment',layer.corona,layer.coronaExtent,layer.prominences,layer.glow);
    color('bodyColor',kelvinToRgb(layer.kelvin));
  } else {
    const rings = layer.ringAmount>0 && layer.ringOuter>layer.ringInner;
    vector('bodyShape',rings ? 0.47/layer.ringOuter : 0.42,0,0,0);
    vector('bodySurface',layer.noiseScale,layer.octaves,layer.banding,layer.lightAngleDeg*Math.PI/180);
    vector('bodyEnvironment',layer.atmosphereWidth,0,0,0);
    vector('bodyRings',rings ? layer.ringAmount : 0,layer.ringInner,layer.ringOuter,Math.max(0.06,Math.sin(layer.ringTiltDeg*Math.PI/180)));
    color('bodyColor',layer.baseColor); color('bodySecond',layer.secondColor); color('bodyAtmosphere',layer.atmosphereColor); color('bodyRingColor',layer.ringColor);
  }
  u.hdrPowerAmt.value = layer.hdrPower ?? 1;
  u.hdrMultiplierAmt.value = layer.hdrMultiplier ?? 1;
  return { material, dispose: () => resources.dispose() };
}
