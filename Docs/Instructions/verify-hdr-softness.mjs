import { chromium } from 'playwright';
import { mkdir, writeFile, open, stat, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output=new URL('../Research/2026-10-24-galactic-jets-hdr/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1200,height:900},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());console.error(d.message());await d.accept();});
const results=[];
try{
 await page.goto('http://localhost:4189/?preset=galactic-rim');await page.waitForTimeout(1500);
 const storage = await page.evaluate(() => navigator.storage.estimate()); console.log('Storage estimate '+JSON.stringify(storage));
 if(process.env.TEST_QUOTA_GB){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:'http://localhost:4189',quotaSize:Number(process.env.TEST_QUOTA_GB)*1024**3});
  console.log('Test-only quota override '+process.env.TEST_QUOTA_GB+' GiB');
 }
 await page.getByRole('button',{name:'Script',exact:true}).click();
 await page.locator('textarea.script-text').fill(JSON.stringify({version:2,layers:[{type:'points',name:'HDR stars',seed:41,numPoints:100,pointSize:8,hdrMultiplier:12,nearColor:{r:1,g:.6,b:.3,a:1},farColor:{r:.2,g:.3,b:.5,a:1}}]}));
 await page.locator('textarea.script-text').blur(); await page.waitForTimeout(700);
 if(await page.locator('.script-error').count())throw Error(await page.locator('.script-error').textContent());
 for(const size of (process.env.NATIVE==='1'?[2048]:process.env.HIGH_RES==='1'?(process.env.ONLY_16K==='1'?[16384]:[8192,16384]):[512,2048])){
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByLabel('Resolution',{exact:true}).selectOption(String(size));
  await page.locator('#export-faces').uncheck();await page.locator('#export-png').uncheck();await page.locator('#export-hdr').check();
  await page.getByLabel('HDR softness',{exact:true}).fill(process.env.NATIVE==='1'?'0':'1');
  const downloadReady=page.waitForEvent('download',{timeout:1200000});const started=Date.now();
  await page.locator('.export-go').click();console.log('Started HDR '+size);
  const timer=setInterval(async()=>{try{console.log(size+': '+await page.locator('.export-go').textContent()); if(errors.length)await page.close();}catch{}},15000);
  let download;try{download=await downloadReady;}finally{clearInterval(timer);}
  const path=fileURLToPath(new URL('hdr-'+size+(process.env.NATIVE==='1'?'-native':'')+'.hdr',output));await download.saveAs(path);
  const file=await open(path,'r');const head=Buffer.alloc(128);await file.read(head,0,128,0);await file.close();
  const header=head.toString('ascii');if(!header.includes('-Y '+size+' +X '+(size*2)))throw Error('Bad HDR dimensions');
  const result={size,width:size*2,softness:process.env.NATIVE==='1'?0:1,bytes:(await stat(path)).size,seconds:(Date.now()-started)/1000};results.push(result);console.log(JSON.stringify(result));
  if(size>=8192)await unlink(path); // Keep measured results, avoid multi-GB research artifacts.
 }
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(new URL(process.env.NATIVE==='1'?'hdr-native.json':process.env.HIGH_RES==='1'?'high-resolution-hdr.json':'hdr-downloads.json',output),JSON.stringify({results,errors,storage,testQuotaGiB:process.env.TEST_QUOTA_GB||null},null,2));
}catch(error){
 await writeFile(new URL('hdr-failure.json',output),JSON.stringify({results,errors,error:String(error),testQuotaGiB:process.env.TEST_QUOTA_GB||null},null,2));
 throw error;
}finally{await browser.close();}
