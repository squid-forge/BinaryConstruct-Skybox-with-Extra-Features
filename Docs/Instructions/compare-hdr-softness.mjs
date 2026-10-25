import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const output=new URL('../Research/2026-10-24-galactic-jets-hdr/',import.meta.url);
async function decode(name){
 const b=await readFile(new URL(name,output));const h=b.subarray(0,128).toString('ascii');const m=/-Y (\d+) \+X (\d+)\n/.exec(h);const height=Number(m[1]),width=Number(m[2]);let pos=m.index+m[0].length;
 const data=new Float32Array(width*height*3),row=new Uint8Array(width*4);let sum=0,max=0,peak=0;
 for(let y=0;y<height;y++){
  if(b[pos]!==2||b[pos+1]!==2)throw Error('Expected RLE');pos+=4;
  for(let c=0;c<4;c++){let x=0;while(x<width){let n=b[pos++];if(n>128){n-=128;const v=b[pos++];for(let k=0;k<n;k++)row[(x++)*4+c]=v;}else{for(let k=0;k<n;k++)row[(x++)*4+c]=b[pos++];}}}
  for(let x=0;x<width;x++){const e=row[x*4+3],scale=e?2**(e-136):0;for(let c=0;c<3;c++){const i=(y*width+x)*3+c,v=row[x*4+c]*scale;data[i]=v;sum+=v;if(v>max){max=v;peak=y*width+x;}}}
 }
 return{data,width,height,sum,max,peak};
}
const native=await decode('hdr-2048-native.hdr'),soft=await decode('hdr-2048.hdr');
const difference=Math.abs(soft.sum/native.sum-1);
if(difference>.03||soft.max>=native.max||soft.max<=1)throw Error('HDR smoothing/radiance check failed');
const browser=await chromium.launch({channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:800,height:460}});
 const crop=(img)=>{const a=[],px=native.peak%native.width,py=Math.floor(native.peak/native.width);for(let y=-24;y<24;y++)for(let x=-24;x<24;x++){const i=((py+y)*img.width+(px+x))*3;for(let c=0;c<3;c++){const v=img.data[i+c];a.push(Math.round(255*Math.pow(v/(1+v),1/2.2)));}a.push(255);}return a;};
 await page.setContent('<body style="background:#13151b;color:white;font:18px sans-serif;margin:24px"><div style="display:flex;gap:24px"><section>Native HDR<br><canvas id="a" width="360" height="360"></canvas></section><section>HDR softness 1<br><canvas id="b" width="360" height="360"></canvas></section></div><p>Same bright star; identical exposure and linear radiance tone mapping.</p></body>');
 await page.evaluate(({a,b})=>{for(const[id,pixels]of[['a',a],['b',b]]){const raw=document.createElement('canvas');raw.width=raw.height=48;raw.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),48,48),0,0);const ctx=document.getElementById(id).getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(raw,0,0,360,360);}}, {a:crop(native),b:crop(soft)});
 await page.screenshot({path:fileURLToPath(new URL('hdr-softness-comparison.png',output))});
 const metrics={nativePeak:native.max,softPeak:soft.max,relativeTotalRadianceDifference:difference,width:native.width,height:native.height};await writeFile(new URL('hdr-radiance-comparison.json',output),JSON.stringify(metrics,null,2));console.log(metrics);
}finally{await browser.close();}
