import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../Research/2026-10-25-element-resolution/',import.meta.url);
await mkdir(out,{recursive:true});
const browser = await chromium.launch({channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto('http://localhost:4189/?preset=galactic-rim'); await page.waitForTimeout(800);
  // Obtain schema-complete defaults through the actual layer buttons.
  await page.getByRole('button',{name:'+sun',exact:true}).click();
  await page.getByRole('button',{name:'+planet',exact:true}).click();
  await page.getByRole('button',{name:'+b.hole',exact:true}).click();
  await page.getByRole('button',{name:'+sprite',exact:true}).click();
  await page.getByRole('button',{name:'Script',exact:true}).click();
  const scene=JSON.parse(await page.locator('textarea.script-text').inputValue());
  const sun={...scene.layers.find(l=>l.type==='sun'),dirLonDeg:-22,dirLatDeg:0,apparentSize:0.8,granulation:1};
  const planet={...scene.layers.find(l=>l.type==='planet'),dirLonDeg:22,dirLatDeg:0,apparentSize:0.5,ringAmount:1,ringTiltDeg:30,noiseScale:16,octaves:9};
  const blackhole={...scene.layers.find(l=>l.type==='blackhole'),dirLonDeg:0,dirLatDeg:0};
  const sprites=['point','halo','hubble','jwst','galaxy-smudge','dust-blob','galaxy-spiral','galaxy-elliptical','galaxy-edgeon','galaxy-globular'].map((style,i)=>({...scene.layers.find(l=>l.type==='sprite'),name:style,texture:`proc:${style}`,dirLonDeg:(i-4.5)*8,dirLatDeg:0,apparentSize:0.07}));
  await page.locator('textarea.script-text').fill(JSON.stringify({version:2,layers:[sun,planet]}));
  await page.getByRole('button',{name:'Layers',exact:true}).click(); await page.waitForTimeout(1000);
  await page.screenshot({path:fileURLToPath(new URL('native-bodies.png',out))});
  const result=await page.evaluate(async({sun,planet,blackhole})=>{
    const preview=window.__preview, renderer=preview.renderer, gl=renderer.getContext();
    const allocations=[], materials=new Set();
    const originalStorage=gl.texStorage2D, originalImage=gl.texImage2D, originalRender=renderer.render;
    gl.texStorage2D=function(...args){allocations.push([args[3],args[4]]);return originalStorage.apply(this,args);};
    gl.texImage2D=function(...args){if(args.length>=9)allocations.push([args[3],args[4]]);return originalImage.apply(this,args);};
    renderer.render=function(scene,camera){scene.traverse(o=>{if(o.material?.name?.startsWith('Native '))materials.add(o.material);});return originalRender.call(this,scene,camera);};
    const half=n=>{const e=(n>>>10)&31,f=n&1023;return (n&32768?-1:1)*(e===0?f*2**-24:(1+f/1024)*2**(e-15));};
    let source;
    try {
      source=await preview.createTileSource([sun,planet],16384);
      const patches=[], crops=[];
      for(const [type,lon] of [['sun',-22],['planet',22]]) {
        const x=Math.floor(8192*(1-Math.tan(lon*Math.PI/180)))-128;
        const pixels=source.render(5,x,8192-128);
        const finite=Array.from(pixels,half).every(Number.isFinite);
        const values=new Set(); let peak=0;
        for(let i=0;i<pixels.length;i+=4){peak=Math.max(peak,half(pixels[i]));values.add(pixels[i]);}
        if(!finite||peak===0||values.size<16)throw Error(`${type} native crop is empty, invalid or lacks surface variation`);
        patches.push({type,peak,distinctRed:values.size});
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const context=canvas.getContext('2d'),image=context.createImageData(256,256);
        for(let i=0;i<pixels.length;i++){const v=Math.max(0,half(pixels[i]));image.data[i]=i%4===3?255:Math.round((v/(1+v))**(1/2.2)*255);}
        context.putImageData(image,0,0);crops.push({type,png:canvas.toDataURL('image/png').split(',')[1]});
      }
      const names=Array.from(materials,m=>m.name);
      if(names.length!==2)throw Error('Built-in bodies did not use native shader surfaces');
      for(const m of materials) {
        if(m.map || !m.fragmentShader.includes('fwidth(r)'))throw Error('Raster body image or fixed limb filtering found');
      }
      if(allocations.some(([w,h])=>w>512||h>512))throw Error('Large body texture allocated in tiled export');
      source.dispose(); source=null;
      gl.texStorage2D=originalStorage;
      // Explicit captures follow the selected detail, independent of the
      // auto memory budget. Use a small capture to verify without a huge job.
      const captureAllocations=[];
      gl.texStorage2D=function(...args){captureAllocations.push([args[3],args[4]]);return originalStorage.apply(this,args);};
      gl.texImage2D=function(...args){if(args.length>=9)captureAllocations.push([args[3],args[4]]);return originalImage.apply(this,args);};
      source=await preview.createTileSource([blackhole],512,{lensResolution:128}); source.render(5,0,0);
      if(!captureAllocations.some(([w,h])=>w===128&&h===128))throw Error(`Explicit lens capture detail not respected: ${JSON.stringify(captureAllocations)}`);
      source.dispose();source=null;
      let invalidRejected=false;
      try{await preview.createTileSource([blackhole],512,{lensResolution:123});}catch{invalidRejected=true;}
      if(!invalidRejected)throw Error('Invalid capture size accepted');
      return {names,patches,crops,allocations,captureAllocations,invalidRejected,activeTileSources:preview.activeTileSources};
    }finally{source?.dispose();gl.texStorage2D=originalStorage;gl.texImage2D=originalImage;renderer.render=originalRender;}
  },{sun,planet,blackhole});
  for(const crop of result.crops)await writeFile(new URL(`${crop.type}-16k-crop.png`,out),Buffer.from(crop.png,'base64'));
  delete result.crops;
  await page.getByRole('button',{name:'Script',exact:true}).click();
  await page.locator('textarea.script-text').fill(JSON.stringify({version:2,layers:sprites}));
  await page.getByRole('button',{name:'Layers',exact:true}).click(); await page.waitForTimeout(800);
  const primitives=await page.evaluate(()=>window.__preview.layerObjects.map(obj=>{
    let key;obj.group.traverse(mesh=>{if(mesh.material?.customProgramCacheKey)key=mesh.material.customProgramCacheKey();});return key;
  }));
  if(primitives.some(key=>!key?.startsWith('native-flare-')))throw Error('A procedural primitive still uses a raster material');
  await page.screenshot({path:fileURLToPath(new URL('native-primitives.png',out))});
  await page.evaluate(async sprites=>{
    const source=await window.__preview.createTileSource(sprites,16384);
    try{for(const sprite of sprites){
      const x=Math.floor(8192*(1-Math.tan(sprite.dirLonDeg*Math.PI/180)))-128;
      const tile=source.render(5,x,8192-128);
      if(!tile.some((v,i)=>i%4!==3&&v>0))throw Error(`${sprite.name} native tile is empty`);
    }}finally{source.dispose();}
  },sprites);
  await page.getByRole('button',{name:'Script',exact:true}).click();
  await page.locator('textarea.script-text').fill(JSON.stringify({version:2,layers:sprites.slice(6).map((sprite,i)=>({...sprite,dirLonDeg:(i-1.5)*17,apparentSize:0.19}))}));
  await page.getByRole('button',{name:'Layers',exact:true}).click();await page.waitForTimeout(500);
  await page.screenshot({path:fileURLToPath(new URL('native-galaxy-primitives.png',out))});
  await page.getByRole('button',{name:'Script',exact:true}).click();
  await page.locator('textarea.script-text').fill(JSON.stringify({version:2,layers:[sun,planet,blackhole]}));
  await page.getByRole('button',{name:'Layers',exact:true}).click();
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByLabel('Lens background detail',{exact:true}).selectOption('native');
  await page.getByLabel('Resolution',{exact:true}).selectOption('16384');
  await page.screenshot({path:fileURLToPath(new URL('capture-detail-ui.png',out))});
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(new URL('results.json',out),JSON.stringify({...result,primitives,errors},null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
