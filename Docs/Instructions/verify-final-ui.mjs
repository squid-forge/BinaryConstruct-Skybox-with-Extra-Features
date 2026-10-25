import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out=new URL('../Research/2026-10-25-final-ui/',import.meta.url);
const examples=new URL('../Examples/',import.meta.url);
await Promise.all([mkdir(out,{recursive:true}),mkdir(examples,{recursive:true})]);
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:4189/?preset=nebula-jets');await page.waitForTimeout(1000);
  if(await page.title()!=='BinaryConstruct Skybox + Extra Features')throw Error('Browser title not renamed');
  await page.getByRole('heading',{level:1}).filter({hasText:'BinaryConstruct Skybox'}).waitFor();
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const layouts=[];
  for(const [width,height] of [[1440,900],[370,800],[320,568],[740,360]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    const metrics=await page.evaluate(()=>{
      const panel=document.querySelector('.export-panel'),options=document.querySelector('.export-options'),go=document.querySelector('.export-go'),tabs=document.querySelector('.tabs');
      const p=panel.getBoundingClientRect(),g=go.getBoundingClientRect();
      return {panel:{top:p.top,bottom:p.bottom,height:p.height},button:{top:g.top,bottom:g.bottom},scrollable:options.scrollHeight>options.clientHeight,tabsHidden:getComputedStyle(tabs).display==='none',overflow:document.documentElement.scrollWidth>innerWidth};
    });
    if(metrics.overflow||!metrics.tabsHidden||metrics.button.top<0||metrics.button.bottom>height||metrics.panel.bottom>height)throw Error(`Clipped export layout ${width}x${height}: ${JSON.stringify(metrics)}`);
    if(width===1440&&metrics.panel.height<height*0.7)throw Error('Export panel still capped to part of sidebar');
    await page.locator('.export-options').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.getByLabel('Variations',{exact:true}).fill('2');
    await page.getByLabel('Variations',{exact:true}).fill('1');
    await page.screenshot({path:fileURLToPath(new URL(`export-${width}x${height}.png`,out))});
    layouts.push({width,height,...metrics});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByLabel('Resolution',{exact:true}).selectOption('512');
  await page.getByRole('button',{name:'Preview HDR smoothness',exact:true}).click();
  await page.getByRole('button',{name:'Close preview',exact:true}).waitFor({timeout:120000});
  await page.getByRole('button',{name:'Close preview',exact:true}).focus();await page.keyboard.press('Shift+Tab');
  if(!await page.getByRole('button',{name:'Pick another preview area'}).evaluate(el=>el===document.activeElement))throw Error('HDR keyboard focus escaped dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Back to editor',exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'Preview HDR smoothness',exact:true}).evaluate(el=>el===document.activeElement))throw Error('HDR close did not restore focus');
  await page.keyboard.press('Escape');
  if(await page.locator('.export-panel').count())throw Error('Escape did not close Export page');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.locator('#export-faces').uncheck();await page.locator('#export-png').check();
  // Keep a real export in preparation long enough to inspect busy controls.
  await page.evaluate(()=>{const scene=window.__preview,original=scene.createTileSource.bind(scene);scene.createTileSource=async(...args)=>{await new Promise(resolve=>setTimeout(resolve,1500));return original(...args);};});
  await page.locator('.export-go').click();
  await page.getByRole('button',{name:'Cancel export',exact:true}).waitFor();
  for(const name of ['Open','Export','Back to editor'])if(!await page.getByRole('button',{name,exact:true}).isDisabled())throw Error(`${name} remained active during export`);
  const cancel=await page.getByRole('button',{name:'Cancel export',exact:true}).boundingBox();
  if(cancel.y+cancel.height>900)throw Error('Cancel action clipped');
  await page.getByRole('button',{name:'Cancel export',exact:true}).click();
  await page.locator('.export-go').waitFor({state:'visible'});await page.waitForTimeout(2000);
  await page.getByRole('button',{name:'Back to editor',exact:true}).click();
  const help=await browser.newPage();await help.goto('http://localhost:4189/help.html');
  const usageHref=await help.getByRole('link',{name:'Usage',exact:true}).getAttribute('href');
  if(!await help.locator(usageHref).count())throw Error('Help usage anchor broken after rename');
  const missingAnchors=await help.evaluate(()=>Array.from(document.querySelectorAll('a[href^="#"]'),a=>a.getAttribute('href')).filter(href=>!document.getElementById(href.slice(1))));
  if(missingAnchors.length)throw Error(`Help anchors missing: ${missingAnchors}`);
  if(await help.locator('table tbody tr').count()<10)throw Error('Element-detail help table did not render');
  await help.setViewportSize({width:320,height:568});
  if(await help.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Narrow help layout overflows');
  await help.screenshot({path:fileURLToPath(new URL('help-320x568.png',out))});await help.close();
  for(const preset of ['smoke-clouds','nebula-jets','galactic-rim']){
    await page.setViewportSize({width:1440,height:600});
    await page.goto(`http://localhost:4189/?preset=${preset}`);await page.waitForTimeout(1600);
    await page.addStyleTag({content:'.sidebar-toggle,.scene-lock{visibility:hidden}'});
    await page.locator('.viewport canvas').screenshot({path:fileURLToPath(new URL(`${preset}.png`,examples))});
  }
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile(new URL('results.json',out),JSON.stringify({layouts,checks:['product title','expanded export page','pinned actions','responsive layout','accessible variations','HDR focus trap and return','Escape close','busy controls and cancellation','help anchors','README preset screenshots'],errors},null,2));
  console.log('Final product UI, export layout, keyboard and README example checks passed');
}finally{await browser.close();}
