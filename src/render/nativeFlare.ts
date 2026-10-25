import type { MeshBasicMaterial } from 'three';
import { NoiseCubemap } from './NoiseCubemap';
import { NOISE_COMMON } from './noiseGlsl';

const STYLES = ['proc:point','proc:halo','proc:hubble','proc:jwst','proc:galaxy-smudge','proc:dust-blob','proc:galaxy-spiral','proc:galaxy-elliptical','proc:galaxy-edgeon','proc:galaxy-globular'];

/** Analytic primitives for live layers; workbench thumbnails remain canvases. */
export function applyNativeFlare(material: MeshBasicMaterial, texture: string): boolean {
  const style = STYLES.indexOf(texture);
  if (style < 0) return false;
  let resources: NoiseCubemap | undefined;
  if (style >= 6) {
    resources = new NoiseCubemap(1);
    resources.configure({seed: ([5,11,7,3][style-6]+0x6a1a)>>>0,noiseType:'fbm',innerColor:{r:1,g:1,b:1,a:1},outerColor:{r:0,g:0,b:0,a:1},octaves:4,gain:0.5,lacunarity:2,offset:1,scale:1,powerAmount:1,shelfAmount:0,ditherAmount:0,warpStrength:0,warpScale:1});
    material.addEventListener('dispose', () => resources!.dispose());
  }
  material.map = null;
  material.onBeforeCompile = shader => {
    if (resources) {
      shader.uniforms.permTexture = resources.directMaterial.uniforms.permTexture;
      shader.uniforms.gradTexture = resources.directMaterial.uniforms.gradTexture;
    }
    shader.vertexShader = 'varying vec2 nativeFlareUV;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nnativeFlareUV = uv;');
    const noise = resources ? 'uniform sampler2D permTexture;\nuniform sampler2D gradTexture;\n' + NOISE_COMMON.slice(NOISE_COMMON.indexOf('vec3 fade('),NOISE_COMMON.indexOf('uniform bool smokeEnabled;')) : '';
    shader.fragmentShader = /* glsl */ `${noise}
varying vec2 nativeFlareUV;
float flareCore(float r, float radius) {
  float t = r/radius;
  if(t<0.25) return mix(1.0,0.55,t/0.25);
  if(t<0.6) return mix(0.55,0.12,(t-0.25)/0.35);
  return mix(0.12,0.0,clamp((t-0.6)/0.4,0.0,1.0));
}
float flareSpike(vec2 p,float angle,float reach,float thickness,float intensity) {
  float c=cos(angle),s=sin(angle);
  vec2 q=vec2(c*p.x+s*p.y,-s*p.x+c*p.y);
  float aa=max(fwidth(q.y),0.000001);
  float strips=(1.0-smoothstep(thickness*0.5-aa,thickness*0.5+aa,abs(q.y)))*0.45
    +(1.0-smoothstep(thickness*1.1-aa,thickness*1.1+aa,abs(q.y)))*0.18
    +(1.0-smoothstep(thickness*2.0-aa,thickness*2.0+aa,abs(q.y)))*0.06;
  return max(0.0,1.0-abs(q.x)/reach)*strips*intensity;
}
vec4 nativeFlare(vec2 uv) {
  vec2 p=(uv-0.5)*256.0;
  float r=length(p);
  float light=0.0;
  ${style === 0 ? 'light=flareCore(r,70.0);' : ''}
  ${style === 1 ? 'light=flareCore(r,55.0)+max(0.0,1.0-abs(r-88.0)/14.0)*0.28;' : ''}
  ${style === 2 ? 'light=flareCore(r,46.0)+flareSpike(p,0.7853981634,118.0,3.0,1.0)+flareSpike(p,2.35619449,118.0,3.0,1.0);' : ''}
  ${style === 3 ? 'light=flareCore(r,42.0)+flareSpike(p,1.57079633,112.0,3.0,0.95)+flareSpike(p,2.61799388,112.0,3.0,0.95)+flareSpike(p,3.66519143,112.0,3.0,0.95)+flareSpike(p,0.0,66.0,2.5,0.7);' : ''}
  ${style === 4 ? 'float ellipse=length(vec2(p.x,p.y*2.2))/120.0; light=exp(-ellipse*5.0)*(1.0-smoothstep(0.8,1.0,ellipse));' : ''}
  ${style === 5 ? 'float alpha=0.85*pow(max(0.0,1.0-r/122.88),2.0); return vec4(vec3(18.0,11.0,8.0)/255.0*alpha,alpha);' : ''}
  ${style >= 6 ? `
  vec2 q=p/120.0;
  float footprint=max(length(dFdx(q)),length(dFdy(q)));
  float grain=fbmNoise(vec3(q*30.0,3.1),4,2.0,0.5)*(1.0-smoothstep(0.01,0.05,footprint));
  vec3 warm=vec3(1.0,0.77,0.49),cool=vec3(0.55,0.72,1.0);
  vec3 galaxy=vec3(0.0);
  ${style === 6 ? `
    q.y/=0.8660254;
    float radius=length(q),angle=atan(q.y,q.x);
    float warp=fbmNoise(vec3(q*6.0,1.7),3,2.0,0.5);
    float phase=angle-radius*6.9115+warp*0.45;
    float arm=exp(-pow(sin(phase)/0.18,2.0));
    float dust=exp(-pow(sin(phase-0.15)/0.06,2.0))*0.55;
    galaxy=warm*exp(-radius*radius/0.025)*1.3+cool*(0.07+arm*0.65)*(1.0-dust)*exp(-radius*2.0)*(1.0+grain*0.7);
    galaxy*=1.0-smoothstep(0.8,1.0,radius);
  ` : ''}
  ${style === 7 ? `
    float radius=length(vec2(q.x,q.y/0.72));
    galaxy=mix(warm,cool*0.8,clamp(radius,0.0,1.0))*exp(-pow(radius*7.0,0.7))*(1.0+grain*0.15);
    galaxy*=1.0-smoothstep(0.8,1.0,radius);
  ` : ''}
  ${style === 8 ? `
    float radius=length(vec2(q.x,q.y*4.0));
    float disc=exp(-abs(q.x)*3.0)/pow(cosh(q.y/0.12),2.0);
    float lane=exp(-pow((q.y+grain*0.015)/0.035,2.0))*0.8;
    galaxy=(cool*disc*0.6+warm*exp(-dot(q,q)/0.025))*(1.0-lane)*(1.0+grain*0.3);
    galaxy*=1.0-smoothstep(0.8,1.0,radius);
  ` : ''}
  ${style === 9 ? `
    float radius=length(q);
    float stars=pow(max(0.0,grain+0.35),6.0)*12.0;
    galaxy=mix(warm,vec3(0.85,0.9,1.0),clamp(radius*2.0,0.0,1.0))*(0.4+stars)/pow(1.0+radius*radius/0.025,1.5);
    galaxy*=1.0-smoothstep(0.8,1.0,radius);
  ` : ''}
  return vec4(max(vec3(0.0),galaxy),1.0);
  ` : ''}
  return vec4(vec3(light),1.0);
}
` + shader.fragmentShader.replace('#include <map_fragment>', 'diffuseColor *= nativeFlare(nativeFlareUV);');
  };
  material.customProgramCacheKey = () => `native-flare-${style}`;
  material.needsUpdate = true;
  return true;
}
