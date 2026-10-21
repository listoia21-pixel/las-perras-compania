import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const html = readFileSync('dist/index.html','utf8');
const css = ['styles.css','cart.css','brand-theme.css','menu-ui.css'].map(file=>readFileSync('dist/'+file,'utf8')).join('\n');
for(const file of ['app.js','cart-model.js','catalog.js','order-config.js']) new vm.Script(readFileSync('dist/'+file,'utf8'));
const context = { window:{} };
vm.runInNewContext(readFileSync('dist/catalog.js','utf8'),context);
const catalog = JSON.parse(JSON.stringify(context.window.MENU_CATALOG));
const source = JSON.parse(readFileSync('fixtures/menu-pdf.json','utf8'));
assert.equal(catalog.length,56);
assert.equal(catalog.filter(product=>product.kind!=='addon').length,55);
assert.ok(catalog.filter(product=>product.kind!=='addon').every(product=>typeof product.image==='string'&&product.image.length>0),'Every menu product needs a photo');
assert.ok(catalog.filter(product=>product.kind!=='addon').every(product=>['restaurant','reference','generated','brand-reference'].includes(product.imageType)),'Every photo needs an honest classification');
assert.equal(new Set(catalog.map(product=>product.id)).size,56);
for(const original of source){
  const item=catalog.find(product=>product.sourceId===original.id);
  assert.ok(item,'Missing '+original.id);
  for(const key of ['name','price','description','options','kind','category']) assert.deepEqual(item[key],original[key],original.id+' '+key);
}
const assets=new Set([...html.matchAll(/(?:src|href)="(assets\/[^"?]+)"/g),...css.matchAll(/url\(['"](assets\/[^'"]+)['"]\)/g)].map(match=>match[1]));
catalog.filter(product=>product.image).forEach(product=>assets.add('assets/'+product.image));
const missing=[...assets].filter(file=>!existsSync('dist/'+file));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const brokenAnchors=[...html.matchAll(/href="#([^"]+)"/g)].map(match=>match[1]).filter(id=>!ids.includes(id));
assert.deepEqual(missing,[]);
assert.deepEqual(brokenAnchors,[]);
assert.equal(new Set(ids).size,ids.length);
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  const file=match[1].split('?')[0];
  if(!file.startsWith('http')) assert.ok(existsSync('dist/'+file),file);
}
assert.ok(!catalog.some(product=>Object.values(product).some(value=>typeof value==='string'&&value.includes('\uFFFD'))));
console.log(JSON.stringify({javascript:'pass',pdfProducts:55,addon:1,exactPdfPricesAndOptions:'pass',assets:assets.size,anchors:'pass'}));
