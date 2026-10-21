'use strict';

const products = Array.isArray(window.MENU_CATALOG) ? window.MENU_CATALOG : [];
const categories = Array.isArray(window.MENU_CATEGORIES) ? window.MENU_CATEGORIES : [];
const menuProducts = products.filter(product => product.kind !== 'addon');
const C = window.PerrasCart;
const orderConfig = window.ORDER_CONFIG || {};
const whatsappCheckout = document.querySelector('#checkout-whatsapp');
const STORAGE_KEY = 'las-perras-cart-v1';
const grid = document.querySelector('#menu-grid');
const filters = document.querySelector('#menu-filters');
const searchInput = document.querySelector('#menu-search');
const menuResults = document.querySelector('#menu-results');
const productDialog = document.querySelector('#product-dialog');
const cartDialog = document.querySelector('#cart-dialog');
const productForm = document.querySelector('#product-form');
const productOptions = document.querySelector('#product-options');
const productExtras = document.querySelector('#product-extras');
const quantityInput = document.querySelector('#product-quantity');
const itemNote = document.querySelector('#product-note');
const generalNote = document.querySelector('#cart-note');
let cart = [];
let currentProduct;
let currentFilter = categories.some(category => category.id === 'perras') ? 'perras' : 'all';
let searchTerm = '';
let lastProductTrigger;
let lastCartTrigger;
let toastTimer;
let storageFailed = false;

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const searchable = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const categoryName = product => product.categoryName || product.category || 'El menú';
const colorFor = product => /^#[\da-f]{3,8}$/i.test(product.color || '') ? product.color : '#6934c5';
const photoFor = product => {
  if (typeof product.image !== 'string') return null;
  const path = product.image.startsWith('menu/') ? `assets/${product.image}` : product.image;
  return /^assets\/[a-z\d/_-]+\.(?:jpe?g|png|webp|avif|svg)$/i.test(path) ? path : null;
};
const isIllustrative = product => ['reference', 'generated', 'brand-reference'].includes(product.imageType);
const photoNote = product => product.imageType === 'brand-reference' ? 'Imagen de referencia de la marca. La presentación puede variar.' : product.imageType === 'generated' ? 'Imagen ilustrativa creada para esta propuesta a partir de la carta. La presentación puede variar.' : 'Imagen de referencia del catálogo. La presentación puede variar.';
const optionGroups = product => Array.isArray(product.options) ? product.options.filter(option => option && Array.isArray(option.values)) : [];
const addOnsFor = product => (Array.isArray(product.addOnIds) ? product.addOnIds : []).map(id => products.find(item => item.id === id && item.kind === 'addon')).filter(Boolean);
const deltaLabel = amount => amount ? ` (${amount > 0 ? '+' : ''}${C.money(amount)})` : '';

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved?.version === 1) { cart = C.normalize(saved.lines, products); generalNote.value = C.cleanNote(saved.note); }
} catch { /* Unavailable or invalid storage must not prevent use of the cart. */ }

function saveCart() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, lines: cart, note: C.cleanNote(generalNote.value) })); }
  catch { storageFailed = true; }
  document.querySelector('#storage-note').hidden = !storageFailed;
}
function syncScrollLock() { document.body.classList.toggle('dialog-open', productDialog.open || cartDialog.open); }
function announce(message) {
  const toast = document.querySelector('#cart-toast');
  if (cartDialog.open) { document.querySelector('#cart-status').textContent = message; return; }
  if (productDialog.open) { document.querySelector('#product-status').textContent = message; return; }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
function resetSummary() { document.querySelector('#summary-fallback').hidden = true; document.querySelector('#copy-cart').textContent = 'Copiar pedido'; updateCheckout(); }
function updateCheckout() {
  const url = C.whatsappUrl(cart, products, generalNote.value, orderConfig);
  const pending = C.pendingSelections(cart, products);
  if (url) whatsappCheckout.href = url;
  else whatsappCheckout.removeAttribute('href');
  whatsappCheckout.setAttribute('aria-disabled', String(!url));
  whatsappCheckout.tabIndex = url ? 0 : -1;
  document.querySelector('#checkout-help').textContent = pending.length ? `Falta elegir ${pending[0].option} de ${pending[0].name}. Elimina ese producto y vuelve a añadirlo para completar sus opciones.` : 'Revisa el pedido y pulsa Enviar en WhatsApp. La confirmación se hace en el chat.';
  document.querySelector('#whatsapp-destination').textContent = `${orderConfig.testMode ? 'PRUEBAS · ' : 'PEDIDOS · '}WhatsApp ${orderConfig.displayNumber || ''}`;
}
whatsappCheckout.addEventListener('click', event => {
  updateCheckout();
  if (!whatsappCheckout.hasAttribute('href')) { event.preventDefault(); announce(document.querySelector('#checkout-help').textContent); return; }
  announce('Continúa en WhatsApp y pulsa Enviar. Tu carrito se conserva aquí.');
});

function placeholderMarkup(product, extraClass = '') {
  return `<div class="product-placeholder ${escapeHTML(extraClass)}" aria-hidden="true" style="--product-color:${escapeHTML(colorFor(product))};--category-color:${escapeHTML(colorFor(product))}"><span class="placeholder-category">${escapeHTML(categoryName(product))}</span><strong>${escapeHTML(product.name)}</strong><span class="placeholder-star" aria-hidden="true">✳</span></div>`;
}
function mediaMarkup(product, context = 'menu') {
  const photo = photoFor(product);
  if (!photo) return placeholderMarkup(product, context === 'cart' ? 'cart-product-placeholder' : context === 'dialog' ? 'dialog-placeholder' : '');
  const dimensions = context === 'cart' ? 'width="86" height="100"' : 'width="800" height="800"';
  const illustrative = isIllustrative(product);
  const alt = illustrative ? `Imagen ilustrativa de ${product.name}` : `${product.name} de Las Perras y Compañía`;
  const caption = illustrative && context !== 'cart' ? `<span class="product-photo-caption">Imagen ilustrativa</span>` : '';
  return `<img ${context === 'dialog' ? 'id="dialog-image" ' : ''}src="${escapeHTML(photo)}" alt="${context === 'cart' ? '' : escapeHTML(alt)}" ${dimensions}${context === 'menu' ? ' loading="lazy"' : ''}>${caption}`;
}
function handleImageFailure(container, product, context) {
  const image = container.querySelector('img');
  image?.addEventListener('error', () => {
    const fallback = document.createElement('div');
    fallback.innerHTML = placeholderMarkup(product, context === 'cart' ? 'cart-product-placeholder' : context === 'dialog' ? 'dialog-placeholder' : '');
    image.replaceWith(fallback.firstElementChild);
    container.querySelector('.product-photo-caption')?.remove();
  }, { once: true });
}

function renderFilters() {
  filters.replaceChildren();
  const groups = [{ id: 'all', name: 'Todo el antojo', count: menuProducts.length }, ...categories];
  groups.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter';
    button.dataset.filter = category.id;
    button.setAttribute('aria-controls', 'menu-grid');
    button.innerHTML = `${escapeHTML(category.name)} <span>${String(category.count ?? menuProducts.filter(product => product.categoryId === category.id).length).padStart(2, '0')}</span>`;
    if (category.color) button.style.setProperty('--category-color', colorFor(category));
    button.addEventListener('click', () => { currentFilter = category.id; renderMenu(); });
    filters.append(button);
  });
}
function renderMenu() {
  filters.querySelectorAll('.filter').forEach(button => {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const terms = searchable(searchTerm).split(/\s+/).filter(Boolean);
  const visibleProducts = menuProducts.filter(product => {
    if (currentFilter !== 'all' && product.categoryId !== currentFilter) return false;
    const text = searchable(`${product.name} ${product.description || ''} ${product.short || ''} ${categoryName(product)}`);
    return terms.every(term => text.includes(term));
  });
  grid.replaceChildren();
  visibleProducts.forEach((product, index) => {
    const card = document.createElement('article');
    card.className = `product-card${isIllustrative(product) ? ' has-illustrative-photo' : ''}`;
    card.style.setProperty('--card-delay', `${Math.min(index, 12) * 25}ms`);
    card.style.setProperty('--product-color', colorFor(product));
    card.style.setProperty('--category-color', colorFor(product));
    card.innerHTML = `<button class="product-open" type="button" aria-label="Ver detalle de ${escapeHTML(product.name)}${isIllustrative(product) ? ', imagen ilustrativa' : ''}"><div class="product-image">${mediaMarkup(product)}${product.tag ? `<span class="product-tag">${escapeHTML(product.tag)}</span>` : ''}<span class="product-plus" aria-hidden="true">↗</span></div><div class="product-copy"><span class="product-label">${escapeHTML(categoryName(product))}</span><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.short || product.description || 'Un antojo de la casa.')}</p></div></button><div class="product-order"><span class="product-price">${escapeHTML(C.money(product.price))}<small>Por unidad</small></span><button class="quick-add" type="button" aria-label="Añadir ${escapeHTML(product.name)} al carrito">Añadir <span aria-hidden="true">+</span></button></div>`;
    const openButton = card.querySelector('.product-open');
    openButton.addEventListener('click', () => openProduct(product, openButton));
    card.querySelector('.quick-add').addEventListener('click', event => {
      if (optionGroups(product).length || addOnsFor(product).length) openProduct(product, event.currentTarget);
      else addToCart(product, 1, '');
    });
    handleImageFailure(card.querySelector('.product-image'), product, 'menu');
    grid.append(card);
  });
  const selectedCategory = categories.find(category => category.id === currentFilter);
  const scope = selectedCategory ? ` en ${selectedCategory.name}` : ' en toda la carta';
  menuResults.textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? 'antojo' : 'antojos'}${scope}${searchTerm.trim() ? ` para “${searchTerm.trim()}”` : ''}.`;
  if (!visibleProducts.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-no-results';
    empty.innerHTML = '<span aria-hidden="true">✳</span><h3>Ese antojo aún no aparece.</h3><p>Prueba otro nombre o explora toda la carta.</p><button class="button button-dark reset-menu" type="button">Ver toda la carta ↗</button>';
    empty.querySelector('button').addEventListener('click', () => {
      currentFilter = 'all'; searchTerm = ''; searchInput.value = ''; renderMenu(); searchInput.focus({ preventScroll: true });
    });
    grid.append(empty);
  }
}

function renderProductChoices(product) {
  productOptions.replaceChildren();
  const groups = optionGroups(product);
  productOptions.hidden = !groups.length;
  groups.forEach((option, index) => {
    const group = document.createElement('div');
    group.className = 'product-option-group';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = `product-option-${index}`;
    label.textContent = `${option.name}${option.required ? ' (elige una opción)' : ' (opcional)'}`;
    const select = document.createElement('select');
    select.id = label.htmlFor;
    select.name = `product-option-${index}`;
    select.className = 'product-option-select';
    select.dataset.optionName = option.name;
    select.required = Boolean(option.required);
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = option.required ? 'Selecciona una opción' : 'Sin preferencia';
    prompt.disabled = Boolean(option.required);
    prompt.selected = true;
    select.append(prompt);
    option.values.forEach(value => {
      const choice = document.createElement('option');
      choice.value = value.id;
      choice.textContent = `${value.name}${deltaLabel(value.priceDelta || 0)}`;
      select.append(choice);
    });
    select.addEventListener('change', updateProductAmount);
    group.append(label, select);
    productOptions.append(group);
  });
  productExtras.replaceChildren();
  const addOns = addOnsFor(product);
  productExtras.hidden = !addOns.length;
  if (!addOns.length) return;
  const extrasGroup = document.createElement('fieldset');
  extrasGroup.className = 'product-extras-group';
  const legend = document.createElement('legend');
  legend.className = 'field-label';
  legend.textContent = 'Dale un extra (opcional, por unidad)';
  extrasGroup.append(legend);
  addOns.forEach(addOn => {
    const label = document.createElement('label');
    label.className = 'product-extra';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'product-extras'; input.value = addOn.id;
    input.addEventListener('change', updateProductAmount);
    const copy = document.createElement('span');
    copy.textContent = addOn.name;
    const price = document.createElement('small');
    price.textContent = `+${C.money(addOn.price)}`;
    copy.append(price);
    label.append(input, copy);
    extrasGroup.append(label);
  });
  productExtras.append(extrasGroup);
}
function currentCustomization() {
  const selections = Object.fromEntries([...productOptions.querySelectorAll('select[data-option-name]')].filter(select => select.value).map(select => [select.dataset.optionName, select.value]));
  const extras = [...productExtras.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  return { selections, extras };
}
function openProduct(product, trigger) {
  lastProductTrigger = trigger;
  currentProduct = product;
  document.querySelector('#dialog-title').textContent = product.name;
  document.querySelector('#dialog-category').textContent = categoryName(product);
  document.querySelector('#dialog-description').textContent = product.description || '';
  const imageNote = document.querySelector('#dialog-photo-note');
  imageNote.hidden = !isIllustrative(product);
  imageNote.textContent = isIllustrative(product) ? photoNote(product) : '';
  document.querySelector('#product-note-label').textContent = '¿Alguna nota para la cocina? (opcional)';
  itemNote.placeholder = 'Por ejemplo: salsa aparte.';
  itemNote.value = '';
  document.querySelector('#product-status').textContent = '';
  quantityInput.value = '1';
  const imageWrap = document.querySelector('#dialog-image-wrap') || document.querySelector('.dialog-image-wrap');
  imageWrap.innerHTML = mediaMarkup(product, 'dialog');
  handleImageFailure(imageWrap, product, 'dialog');
  renderProductChoices(product);
  updateProductAmount();
  if (!productDialog.open) productDialog.showModal();
  syncScrollLock();
}
function updateProductAmount() {
  if (!currentProduct) return;
  const quantity = Math.max(1, Math.min(C.MAX_QUANTITY, Number(quantityInput.value) || 1));
  quantityInput.value = String(quantity);
  document.querySelector('#product-minus').disabled = quantity <= 1;
  document.querySelector('#product-plus').disabled = quantity >= C.MAX_QUANTITY;
  const unitPrice = C.unitPrice({ id: currentProduct.id, note: '', ...currentCustomization() }, products);
  document.querySelector('#dialog-price').textContent = C.money(unitPrice);
  document.querySelector('#add-product-total').textContent = C.money(unitPrice * quantity);
}
document.querySelector('#product-minus').addEventListener('click', () => { quantityInput.value = String(Math.max(1, Number(quantityInput.value) - 1)); updateProductAmount(); });
document.querySelector('#product-plus').addEventListener('click', () => { quantityInput.value = String(Math.min(C.MAX_QUANTITY, Number(quantityInput.value) + 1)); updateProductAmount(); });
productForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!productForm.reportValidity()) return;
  if (!addToCart(currentProduct, Number(quantityInput.value), itemNote.value, false, currentCustomization())) return;
  productDialog.close();
  announce(`${currentProduct.name} en tu carrito. ¡Se armó el antojo!`);
});
document.querySelector('.dialog-close').addEventListener('click', () => productDialog.close());
productDialog.addEventListener('close', () => { syncScrollLock(); if (!cartDialog.open) lastProductTrigger?.focus({ preventScroll: true }); });

function addToCart(product, quantity, note, notify = true, customization = {}) {
  if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > C.MAX_QUANTITY) return false;
  const candidate = { id: product.id, note: C.cleanNote(note), selections: customization.selections || {}, extras: customization.extras || [] };
  const missingChoice = optionGroups(product).find(option => option.required && !option.values.some(value => value.id === candidate.selections[option.name]));
  if (missingChoice) { announce(`Elige una opción de ${missingChoice.name} para añadir este producto.`); return false; }
  const existing = cart.find(line => C.keyFor(line) === C.keyFor(candidate));
  if ((existing?.quantity || 0) + quantity > C.MAX_QUANTITY) { announce(`Máximo ${C.MAX_QUANTITY} unidades por selección. Ya tienes ${existing?.quantity || 0} en el carrito.`); return false; }
  const before = C.totals(cart, products).count;
  cart = C.add(cart, product.id, quantity, note, products, customization);
  if (C.totals(cart, products).count === before) { announce(`Puedes añadir hasta ${C.MAX_QUANTITY} unidades por selección.`); return false; }
  saveCart(); renderCart();
  if (notify) announce(`${product.name} en tu carrito. ¡Se armó el antojo!`);
  return true;
}
function renderCart(focusKey, focusAction) {
  const { count, amount } = C.totals(cart, products);
  document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = String(count); });
  document.querySelectorAll('[data-cart-total]').forEach(element => { element.textContent = C.money(amount); });
  document.querySelectorAll('[data-open-cart]').forEach(element => { element.setAttribute('aria-label', `Abrir carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`); });
  document.querySelector('#cart-bar').hidden = count === 0;
  document.body.classList.toggle('has-cart', count > 0);
  document.querySelector('#cart-empty').hidden = count > 0;
  document.querySelector('#cart-content').hidden = count === 0;
  document.querySelector('#cart-footer').hidden = count === 0;
  document.querySelector('#clear-cart').hidden = count === 0;
  document.querySelector('#cart-item-label').textContent = `${count} ${count === 1 ? 'producto' : 'productos'} · Hecho a tu antojo`;
  const list = document.querySelector('#cart-items');
  list.replaceChildren();
  cart.forEach(line => {
    const product = products.find(item => item.id === line.id);
    if (!product) return;
    const unitPrice = C.unitPrice(line, products);
    const row = document.createElement('li');
    row.className = 'cart-item'; row.dataset.key = C.keyFor(line);
    row.innerHTML = `${mediaMarkup(product, 'cart')}<div class="cart-item-info"><h3>${escapeHTML(product.name)}</h3><span class="cart-unit-price">${escapeHTML(C.money(unitPrice))} / unidad</span><p class="cart-line-selections"></p><p class="cart-line-note"></p><div class="cart-item-bottom"><div class="quantity-control"><button type="button" data-action="minus" aria-label="Disminuir cantidad de ${escapeHTML(product.name)}" ${line.quantity <= 1 ? 'disabled' : ''}>−</button><span class="quantity-value" aria-label="Cantidad">${line.quantity}</span><button type="button" data-action="plus" aria-label="Aumentar cantidad de ${escapeHTML(product.name)}" ${line.quantity >= C.MAX_QUANTITY ? 'disabled' : ''}>+</button></div><strong>${escapeHTML(C.money(unitPrice * line.quantity))}</strong></div><button type="button" class="remove-item" data-action="remove" aria-label="Eliminar ${escapeHTML(product.name)} del carrito">Eliminar</button></div>`;
    const selections = row.querySelector('.cart-line-selections');
    selections.textContent = C.selectionText(line, products); selections.hidden = !selections.textContent;
    const note = row.querySelector('.cart-line-note');
    note.textContent = line.note; note.hidden = !line.note;
    if (isIllustrative(product)) {
      const caption = document.createElement('small');
      caption.className = 'cart-photo-note'; caption.textContent = 'Imagen ilustrativa';
      row.querySelector('.cart-item-info').append(caption);
    }
    handleImageFailure(row, product, 'cart');
    list.append(row);
  });
  resetSummary();
  if (focusKey) {
    const row = [...list.children].find(element => element.dataset.key === focusKey);
    const next = row?.querySelector(`[data-action="${focusAction}"]:not(:disabled)`) || row?.querySelector('button:not(:disabled)') || document.querySelector('#cart-close');
    next.focus({ preventScroll: true });
  }
}
function openCart(trigger) {
  closeNavigation(); lastCartTrigger = trigger;
  document.querySelector('#cart-status').textContent = '';
  if (productDialog.open) productDialog.close();
  if (!cartDialog.open) cartDialog.showModal();
  syncScrollLock();
}
document.querySelectorAll('[data-open-cart]').forEach(button => button.addEventListener('click', () => openCart(button)));
document.querySelector('#cart-close').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('close', () => {
  syncScrollLock();
  const target = lastCartTrigger && !lastCartTrigger.hidden ? lastCartTrigger : document.querySelector('.header-cart');
  target?.focus({ preventScroll: true });
});
[productDialog, cartDialog].forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
document.querySelector('#empty-explore').addEventListener('click', () => { cartDialog.close(); document.querySelector('#menu').scrollIntoView({ behavior: 'smooth' }); });
document.querySelector('#cart-items').addEventListener('click', event => {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) return;
  const key = actionButton.closest('.cart-item').dataset.key;
  const line = cart.find(item => C.keyFor(item) === key);
  if (!line) return;
  if (actionButton.dataset.action === 'remove') {
    cart = cart.filter(item => C.keyFor(item) !== key);
    if (!cart.length) generalNote.value = '';
    announce('Producto eliminado del carrito.');
  } else cart = C.setQuantity(cart, key, line.quantity + (actionButton.dataset.action === 'plus' ? 1 : -1), products);
  saveCart(); renderCart(key, actionButton.dataset.action);
});
document.querySelector('#clear-cart').addEventListener('click', () => { cart = []; generalNote.value = ''; saveCart(); renderCart(); document.querySelector('#cart-close').focus(); announce('Carrito vacío. Puedes empezar otro antojo.'); });
generalNote.addEventListener('input', () => { saveCart(); resetSummary(); });
document.querySelector('#copy-cart').addEventListener('click', async () => {
  const summary = C.summary(cart, products, generalNote.value, { forWhatsApp: true, testMode: Boolean(orderConfig.testMode) });
  if (!summary) return;
  try {
    await navigator.clipboard.writeText(summary);
    document.querySelector('#copy-cart').textContent = 'Pedido copiado ✓';
    announce('Pedido copiado. Puedes pegarlo en el chat de WhatsApp y pulsar Enviar.');
  } catch {
    const area = document.querySelector('#order-summary');
    area.value = summary; document.querySelector('#summary-fallback').hidden = false; area.focus(); area.select();
    announce('Selecciona y copia el resumen que aparece debajo.');
  }
});
searchInput.addEventListener('input', () => { searchTerm = searchInput.value; if (searchTerm.trim()) currentFilter = 'all'; renderMenu(); });
const toggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeNavigation() { toggle.setAttribute('aria-expanded', 'false'); mobileNav.hidden = true; toggle.setAttribute('aria-label', 'Abrir navegación'); }
toggle.addEventListener('click', () => {
  const expanded = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!expanded)); toggle.setAttribute('aria-label', expanded ? 'Abrir navegación' : 'Cerrar navegación'); mobileNav.hidden = expanded;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNavigation));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNavigation(); });
window.matchMedia('(min-width: 761px)').addEventListener('change', event => { if (event.matches) closeNavigation(); });
renderFilters();
renderMenu();
renderCart();
