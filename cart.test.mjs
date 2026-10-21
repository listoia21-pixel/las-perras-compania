import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ Intl, URL, window: {} });
vm.runInContext(readFileSync(new URL('./dist/cart-model.js', import.meta.url), 'utf8'), context);
vm.runInContext(readFileSync(new URL('./dist/order-config.js', import.meta.url), 'utf8'), context);
const C = context.PerrasCart;
const orderConfig = context.window.ORDER_CONFIG;
const catalog = JSON.parse(readFileSync(new URL('./fixtures/menu-pdf.json', import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const choice = (name, id) => ({ selections: { [name]: id } });
const sausage = { extras: ['salchicha-casa'] };
const tests = [];
function test(name, fn) { fn(); tests.push(name); }

// This independently transcribed price table catches missing rows and accidental old Rappi prices.
const expectedPrices = {
  'papa-cheddar':14300,'aros-cebolla':14300,'empanaditas':15400,'arepa-chocolo':17800,'palitos-queso':18500,'chicharroncito':21600,
  'uyy-mamiii':21700,'rola':21700,'boyacence':23500,'costena':23500,'bichota':25400,'potra-empoderada':25400,'buenona':26700,'sapa-perra':29500,
  'palitos-pollo':19600,'mini-burguers':19600,'mini-perritos':19600,'alas-x8':23800,'alas-x12':28500,'alas-x16':33200,
  'papa-francesa':3500,'papa-casco':5000,'papa-casa':9000,'pechugona':21700,'la-socromatica':23000,'la-gomela':24500,'que-mas-mor':25900,
  'la-divaza':26500,'bandida':31000,'sugar-mami':33000,'la-trepada':35600,'la-puerca':38100,
  'papi-chulo':22600,'papacito':26500,'viejo-verde':26500,'macho-alfa':28500,
  'la-espelucaa':22800,'parchaito':24500,'macho-tatuado':25500,'bowl-chimbita':29000,'el-berriendo':33000,
  'brownie-helado':12000,'banana-tempura-helado':12000,'oreo-tempura-helado':12000,
  'malteadas':16500,'sodas-artesanales':11900,'limonadas':8900,'limonadas-especiales':11300,'juntos-revueltos':9500,
  'gaseosas-350ml':3800,'agua-500ml':4200,'cerveza-poker':4700,'cerveza-aguila':4700,'cerveza-budweiser':5900,'cerveza-club':6500,'salchicha-casa':5900
};

test('All 56 PDF menu records and prices', () => {
  assert.equal(catalog.length, 56);
  assert.deepEqual(Object.fromEntries(catalog.map(product => [product.id, product.price])), expectedPrices);
  assert.equal(catalog.filter(product => product.kind === 'food').length, 44);
  assert.equal(catalog.filter(product => product.kind === 'drink').length, 11);
  assert.equal(catalog.filter(product => product.kind === 'addon').length, 1);
  assert.equal(catalog.filter(product => product.kind === 'drink').reduce((count, product) => count + (product.options[0]?.values.length || 1), 0), 29);
});

test('Legacy five-argument add, quantity changes, notes and merge', () => {
  let cart = C.add([], 'uyy-mamiii', 2, '', catalog);
  cart = C.add(cart, 'sodas-artesanales', 1, 'Frutos rojos, si hay', catalog);
  assert.equal(C.totals(cart, catalog).amount, 55300);
  assert.equal(C.totals(cart, catalog).count, 3);
  cart = C.add(cart, 'uyy-mamiii', 1, '', catalog);
  assert.equal(cart.length, 2);
  assert.equal(C.totals(cart, catalog).amount, 77000);
  cart = C.add(cart, 'uyy-mamiii', 1, 'Salsa aparte', catalog);
  assert.equal(cart.length, 3);
  const key = C.keyFor(cart[0]);
  cart = C.setQuantity(cart, key, 1, catalog);
  assert.equal(cart[0].quantity, 1);
  assert.equal(C.setQuantity(cart, key, 0, catalog)[0].quantity, 1);
  assert.equal(C.setQuantity(cart, key, 21, catalog)[0].quantity, 1);
  assert.equal(C.totals(cart, catalog).amount, 55300);
});

test('Different drink flavors remain separate and identical flavors merge', () => {
  let cart = C.add([], 'malteadas', 1, '', catalog, choice('Sabor', 'sabor-1'));
  cart = C.add(cart, 'malteadas', 1, '', catalog, choice('Sabor', 'sabor-4'));
  assert.equal(cart.length, 2);
  assert.notEqual(C.keyFor(cart[0]), C.keyFor(cart[1]));
  assert.match(C.selectionText(cart[0], catalog), /Lulo/);
  assert.match(C.selectionText(cart[1], catalog), /Oreo/);
  cart = C.add(cart, 'malteadas', 1, '', catalog, choice('Sabor', 'sabor-1'));
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.equal(C.totals(cart, catalog).amount, 49500);
});

test('Sausage costs 5900 per unit, changes line identity and is not sold standalone', () => {
  let cart = C.add([], 'uyy-mamiii', 2, '', catalog, sausage);
  assert.equal(C.unitPrice(cart[0], catalog), 27600);
  assert.equal(C.totals(cart, catalog).amount, 55200);
  cart = C.add(cart, 'uyy-mamiii', 1, '', catalog);
  assert.equal(cart.length, 2);
  assert.equal(C.totals(cart, catalog).amount, 76900);
  const duplicateExtras = C.normalize([{ id: 'uyy-mamiii', quantity: 2, extras: ['salchicha-casa', 'salchicha-casa'] }], catalog);
  assert.deepEqual(plain(duplicateExtras[0].extras), ['salchicha-casa']);
  assert.equal(C.totals(duplicateExtras, catalog).amount, 55200);
  assert.equal(C.add([], 'salchicha-casa', 1, '', catalog).length, 0);
});

test('All eight Perras accept sausage; unrelated dishes reject it', () => {
  for (const product of catalog.filter(product => product.category === 'Perras')) {
    const cart = C.add([], product.id, 1, '', catalog, sausage);
    assert.equal(C.unitPrice(cart[0], catalog), product.price + 5900, product.name);
  }
  const cart = C.add([], 'pechugona', 1, '', catalog, sausage);
  assert.deepEqual(plain(cart[0].extras), []);
  assert.equal(C.unitPrice(cart[0], catalog), 21700);
  const changed = catalog.map(product => product.id === 'salchicha-casa' ? { ...product, eligibleCategories: ['Otro'] } : product);
  assert.deepEqual(plain(C.normalize([{ id:'rola', quantity:1, extras:['salchicha-casa'] }], changed)[0].extras), []);
});

test('Bandida with and without pickles stays separate without invented fees', () => {
  let cart = C.add([], 'bandida', 1, '', catalog, choice('Pepinillos', 'con-pepinillos'));
  cart = C.add(cart, 'bandida', 1, '', catalog, choice('Pepinillos', 'sin-pepinillos'));
  assert.equal(cart.length, 2);
  assert.equal(C.totals(cart, catalog).amount, 62000);
  assert.match(C.selectionText(cart[0], catalog), /Con pepinillos/);
  assert.match(C.selectionText(cart[1], catalog), /Sin pepinillos/);
});

test('Old storage preserves pending required choices without choosing for the customer', () => {
  const restored = C.normalize([{ id:'malteadas', quantity:1 }, { id:'bandida', quantity:1 }], catalog);
  assert.deepEqual(plain(restored[0].selections), {});
  assert.deepEqual(plain(restored[0].extras), []);
  assert.match(C.selectionText(restored[0], catalog), /Sabor: pendiente de elegir/);
  assert.match(C.selectionText(restored[1], catalog), /Pepinillos: pendiente de elegir/);
  assert.equal(C.totals(restored, catalog).amount, 47500);
  const invalid = C.normalize([{ id:'malteadas', quantity:1, selections:{Sabor:'sabor-inventado',Unknown:'x'}, extras:['salchicha-casa','unknown'] }], catalog);
  assert.deepEqual(plain(invalid[0].selections), {});
  assert.deepEqual(plain(invalid[0].extras), []);
});

test('Canonical keys normalize whitespace, selection order and duplicate extras', () => {
  const first = { id:'test', note:'  Salsa\n  aparte  ', selections:{B:'two',A:'one'}, extras:['b','a','b'] };
  const second = { id:'test', note:'Salsa aparte', selections:{A:'one',B:'two'}, extras:['a','b'] };
  assert.equal(C.keyFor(first), C.keyFor(second));
  const cart = C.normalize([
    { id:'uyy-mamiii', quantity:1, note:'  Salsa\n  aparte  ', extras:['salchicha-casa','salchicha-casa'] },
    { id:'uyy-mamiii', quantity:2, note:'Salsa aparte', extras:['salchicha-casa'] }
  ], catalog);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(C.totals(cart, catalog).amount, 82800);
});

test('Malformed storage, quantity clamp and note bounds', () => {
  const damaged = C.normalize([
    null, { id:'unknown',quantity:2 }, { id:'uyy-mamiii',quantity:1.5 },
    { id:'uyy-mamiii',quantity:-3 }, { id:'sodas-artesanales',quantity:999,note:'a'.repeat(400),price:1 }
  ], catalog);
  assert.equal(damaged.length, 2);
  assert.equal(damaged[0].quantity, 1);
  assert.equal(damaged[1].quantity, 20);
  assert.equal(damaged[1].note.length, 200);
  assert.equal(C.totals(damaged, catalog).amount, 259700);
  assert.equal(C.cleanNote('  Salsa\u0000\u001f aparte '), 'Salsa aparte');
  assert.equal(C.normalize({lines:[]}, catalog).length, 0);
  assert.equal(C.normalize([], null).length, 0);
});

test('Persisted or injected prices cannot override current base, option or addon prices', () => {
  const stored = [
    { id:'uyy-mamiii',quantity:2,price:1,unitPrice:1,extras:['salchicha-casa'],addonPrice:1 },
    { id:'malteadas',quantity:1,selections:{Sabor:'sabor-1'},price:1,priceDelta:-999999,options:[{priceDelta:-999999}] }
  ];
  const restored = C.normalize(JSON.parse(JSON.stringify(stored)), catalog);
  assert.equal(C.totals(restored, catalog).amount, 71700);
  assert.equal(restored[0].price, undefined);
  assert.equal(restored[0].unitPrice, undefined);
  assert.equal(restored[1].priceDelta, undefined);
  const updatedCatalog = catalog.map(product => {
    if (product.id === 'uyy-mamiii') return { ...product, price:22000 };
    if (product.id === 'salchicha-casa') return { ...product, price:6100 };
    if (product.id === 'malteadas') return {
      ...product,
      options:product.options.map(option => ({ ...option, values:option.values.map(value => value.id === 'sabor-1' ? { ...value, priceDelta:1200 } : value) }))
    };
    return product;
  });
  assert.equal(C.totals(restored, updatedCatalog).amount, 73900);
  assert.equal(C.unitPrice(restored[0], updatedCatalog), 28100);
  assert.equal(C.unitPrice(restored[1], updatedCatalog), 17700);
  assert.deepEqual(plain(C.normalize(JSON.parse(JSON.stringify(restored)), catalog)), plain(restored));
});

test('Removing a flavor or an addon invalidates only that old customization', () => {
  const oldCart = C.add(C.add([], 'malteadas', 1, '', catalog, choice('Sabor','sabor-1')), 'rola', 1, '', catalog, sausage);
  const updatedCatalog = catalog.filter(product => product.id !== 'salchicha-casa').map(product => product.id === 'malteadas' ? { ...product, options:product.options.map(option => ({...option,values:option.values.filter(value => value.id !== 'sabor-1')})) } : product);
  const restored = C.normalize(oldCart, updatedCatalog);
  assert.equal(restored.length, 2);
  assert.deepEqual(plain(restored[0].selections), {});
  assert.deepEqual(plain(restored[1].extras), []);
  assert.equal(C.totals(restored, updatedCatalog).amount, 38200);
});

test('Human order summary includes choices, per-unit extras, notes and delivery status', () => {
  let cart = C.add([], 'uyy-mamiii', 2, 'Salsa aparte', catalog, sausage);
  cart = C.add(cart, 'malteadas', 1, '', catalog, choice('Sabor','sabor-4'));
  const summary = C.summary(cart, catalog, 'Para compartir');
  assert.match(summary, /Salsa aparte/);
  assert.match(summary, /Para compartir/);
  assert.match(summary, /Sabor: Oreo/);
  assert.match(summary, /Salchicha de la casa/);
  assert.ok(summary.includes(C.money(71700)));
  assert.match(summary, /Precios de la carta del restaurante/);
  assert.match(summary, /domicilio por confirmar/);
  assert.match(summary, /no envía ni confirma el pedido/);
  assert.doesNotMatch(summary, /Rappi/i);
  assert.equal(C.summary([], catalog, ''), '');
});

test('WhatsApp link carries the complete test order to the configured Colombian number', () => {
  assert.equal(orderConfig.whatsappNumber, '573222290244');
  assert.equal(orderConfig.testMode, true);
  let cart = C.add([], 'uyy-mamiii', 2, 'Salsa aparte & sin picante + queso #1', catalog, sausage);
  cart = C.add(cart, 'malteadas', 1, '', catalog, choice('Sabor','sabor-4'));
  const href = C.whatsappUrl(cart, catalog, 'Prueba 🐶 100% & más + #', orderConfig);
  const url = new URL(href);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/573222290244');
  assert.equal([...url.searchParams.keys()].join(','), 'text');
  const text = url.searchParams.get('text');
  assert.equal(text, C.summary(cart, catalog, 'Prueba 🐶 100% & más + #', { forWhatsApp:true, testMode:true }));
  for(const content of ['PEDIDO DE PRUEBA', '2 × Uyy Mamiii','Sabor: Oreo','Salchicha de la casa','Salsa aparte & sin picante + queso #1','Prueba 🐶 100% & más + #',C.money(71700)]) assert.ok(text.includes(content),content);
  assert.match(text,/Por favor confirmen disponibilidad/);
  assert.doesNotMatch(text,/pedido enviado|pedido confirmado|no envía ni confirma/i);
  assert.equal(C.totals(cart, catalog).count,3,'Creating a checkout URL must preserve the cart');
});

test('WhatsApp blocks empty, incomplete or invalid destinations and refreshes after edits', () => {
  assert.equal(C.whatsappUrl([],catalog,'',orderConfig),'');
  const pending=C.add([], 'malteadas',1,'',catalog);
  assert.equal(C.whatsappUrl(pending,catalog,'',orderConfig),'');
  assert.equal(C.pendingSelections(pending,catalog)[0].option,'Sabor');
  const ready=C.add([], 'malteadas',1,'',catalog,choice('Sabor','sabor-4'));
  for(const whatsappNumber of ['+573222290244','573222290244?text=other','0','https://example.com']) assert.equal(C.whatsappUrl(ready,catalog,'',{...orderConfig,whatsappNumber}),'');
  const before=C.whatsappUrl(ready,catalog,'Primera nota',orderConfig);
  const after=C.whatsappUrl(C.setQuantity(ready,C.keyFor(ready[0]),2,catalog),catalog,'Segunda nota',orderConfig);
  assert.notEqual(before,after);
  assert.ok(new URL(after).searchParams.get('text').includes(C.money(33000)));
  assert.ok(new URL(after).searchParams.get('text').includes('Segunda nota'));
  const clippedEmoji='a'.repeat(199)+'🐶';
  assert.doesNotThrow(()=>C.whatsappUrl(ready,catalog,clippedEmoji,orderConfig));
  assert.ok(new URL(C.whatsappUrl(ready,catalog,'\ud800',orderConfig)).searchParams.get('text').includes('\ufffd'));
  const productionMessage=new URL(C.whatsappUrl(ready,catalog,'',{...orderConfig,testMode:false})).searchParams.get('text');
  assert.doesNotMatch(productionMessage,/PEDIDO DE PRUEBA/);
});

console.log(JSON.stringify({ status:'pass', suites:tests.length, catalogRecords:catalog.length, checks:tests }, null, 2));


