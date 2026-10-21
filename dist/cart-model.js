/* Prices and available choices come from the current menu, never from storage. */
(function (root) {
  'use strict';
  const MAX_QUANTITY = 20;
  const cleanNote = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200).trim() : '';
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validPrice = value => Number.isFinite(value) && value >= 0;
  const catalogMap = catalog => new Map((Array.isArray(catalog) ? catalog : []).filter(product => product && typeof product.id === 'string').map(product => [product.id, product]));
  const optionGroups = product => Array.isArray(product.options) ? product.options.filter(option => option && typeof option.name === 'string' && Array.isArray(option.values)) : [];
  const valuesFor = option => option.values.filter(value => value && typeof value.id === 'string' && typeof value.name === 'string');
  const priceDelta = value => Number.isFinite(value.priceDelta) ? value.priceDelta : 0;

  function canonicalSelections(selections) {
    if (!isObject(selections)) return {};
    return Object.fromEntries(Object.keys(selections).sort().filter(name => typeof selections[name] === 'string').map(name => [name, selections[name]]));
  }
  function canonicalExtras(extras) {
    return Array.isArray(extras) ? [...new Set(extras.filter(id => typeof id === 'string'))].sort() : [];
  }
  function keyFor(line) {
    return JSON.stringify([line.id, cleanNote(line.note), canonicalSelections(line.selections), canonicalExtras(line.extras)]);
  }
  function customizationFor(raw, product, byId) {
    const supplied = isObject(raw.selections) ? raw.selections : {};
    const selections = Object.fromEntries(optionGroups(product).flatMap(option => {
      const id = Object.prototype.hasOwnProperty.call(supplied, option.name) ? supplied[option.name] : undefined;
      const selected = valuesFor(option).find(value => value.id === id);
      return selected ? [[option.name, selected.id]] : [];
    }).sort(([first], [second]) => first.localeCompare(second)));
    const allowed = new Set(Array.isArray(product.addOnIds) ? product.addOnIds : []);
    const extras = canonicalExtras(raw.extras).filter(id => {
      const addon = byId.get(id);
      return allowed.has(id) && addon && addon.kind === 'addon' && validPrice(addon.price) &&
        (!Array.isArray(addon.eligibleCategories) || addon.eligibleCategories.includes(product.category));
    });
    return { selections, extras };
  }
  function normalize(input, catalog) {
    const byId = catalogMap(catalog);
    const lines = [];
    if (!Array.isArray(input)) return lines;
    input.slice(0, 100).forEach(raw => {
      if (!isObject(raw) || !Number.isInteger(raw.quantity)) return;
      const product = byId.get(raw.id);
      if (!product || product.kind === 'addon' || !validPrice(product.price)) return;
      const line = {
        id: product.id,
        quantity: Math.max(1, Math.min(MAX_QUANTITY, raw.quantity)),
        note: cleanNote(raw.note),
        ...customizationFor(raw, product, byId)
      };
      const previous = lines.find(item => keyFor(item) === keyFor(line));
      if (previous) previous.quantity = Math.min(MAX_QUANTITY, previous.quantity + line.quantity);
      else lines.push(line);
    });
    return lines;
  }
  function add(lines, productId, quantity, note, catalog, customization = {}) {
    const choices = isObject(customization) ? customization : {};
    return normalize([...(Array.isArray(lines) ? lines : []), { id: productId, quantity, note, selections: choices.selections, extras: choices.extras }], catalog);
  }
  function setQuantity(lines, key, quantity, catalog) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return normalize(lines, catalog);
    return normalize((Array.isArray(lines) ? lines : []).map(line => keyFor(line) === key ? { ...line, quantity } : line), catalog);
  }
  function unitPrice(line, catalog) {
    const byId = catalogMap(catalog);
    const product = line && byId.get(line.id);
    if (!product || product.kind === 'addon' || !validPrice(product.price)) return 0;
    const choices = customizationFor(line, product, byId);
    const optionsAmount = optionGroups(product).reduce((amount, option) => {
      const selected = valuesFor(option).find(value => value.id === choices.selections[option.name]);
      return amount + (selected ? priceDelta(selected) : 0);
    }, 0);
    return product.price + optionsAmount + choices.extras.reduce((amount, id) => amount + byId.get(id).price, 0);
  }
  function totals(lines, catalog) {
    return normalize(lines, catalog).reduce((total, line) => ({
      count: total.count + line.quantity,
      amount: total.amount + unitPrice(line, catalog) * line.quantity
    }), { count: 0, amount: 0 });
  }
  const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  function selectionText(line, catalog) {
    const byId = catalogMap(catalog);
    const product = line && byId.get(line.id);
    if (!product || product.kind === 'addon') return '';
    const choices = customizationFor(line, product, byId);
    const descriptions = optionGroups(product).flatMap(option => {
      const selected = valuesFor(option).find(value => value.id === choices.selections[option.name]);
      if (!selected) return option.required ? [option.name + ': pendiente de elegir'] : [];
      const delta = priceDelta(selected);
      return [option.name + ': ' + selected.name + (delta ? ' (' + (delta > 0 ? '+' : '') + money(delta) + ')' : '')];
    });
    choices.extras.forEach(id => {
      const addon = byId.get(id);
      descriptions.push(addon.name + ' (+' + money(addon.price) + ')');
    });
    return descriptions.join(' · ');
  }
  function pendingSelections(lines, catalog) {
    const byId = catalogMap(catalog);
    return normalize(lines, catalog).flatMap(line => {
      const product = byId.get(line.id);
      return optionGroups(product).filter(option => option.required && !valuesFor(option).some(value => value.id === line.selections[option.name])).map(option => ({ id: product.id, name: product.name, option: option.name }));
    });
  }
  function summary(lines, catalog, note, settings = {}) {
    const valid = normalize(lines, catalog);
    if (!valid.length) return '';
    const byId = catalogMap(catalog);
    const rows = valid.map(line => {
      const choices = selectionText(line, catalog);
      return line.quantity + ' × ' + byId.get(line.id).name + ' — ' + money(unitPrice(line, catalog) * line.quantity) +
        (choices ? '\n   ' + choices : '') + (line.note ? '\n   Nota: ' + line.note : '');
    });
    return [
      'LAS PERRAS & COMPAÑÍA', settings.forWhatsApp ? (settings.testMode ? 'PEDIDO DE PRUEBA · WEB' : 'Pedido desde la web — por confirmar') : 'Mi selección — por confirmar', '', ...rows, '',
      'Total de productos: ' + money(totals(valid, catalog).amount),
      cleanNote(note) ? 'Nota general: ' + cleanNote(note) : '', '',
      settings.forWhatsApp ? 'Precios de la carta del restaurante. Por favor confirmen disponibilidad, domicilio y total antes de preparar el pedido.' : 'Precios de la carta del restaurante. Disponibilidad y domicilio por confirmar. Este resumen no envía ni confirma el pedido.'
    ].filter((value, index, array) => value !== '' || array[index - 1] !== '').join('\n');
  }
  function whatsappUrl(lines, catalog, note, settings = {}) {
    if (!/^[1-9]\d{7,14}$/.test(settings.whatsappNumber || '') || !normalize(lines, catalog).length || pendingSelections(lines, catalog).length) return '';
    const url = new URL('https://wa.me/' + settings.whatsappNumber);
    url.searchParams.set('text', summary(lines, catalog, note, { forWhatsApp: true, testMode: Boolean(settings.testMode) }));
    return url.href;
  }
  root.PerrasCart = Object.freeze({ MAX_QUANTITY, cleanNote, keyFor, normalize, add, setQuantity, unitPrice, selectionText, totals, money, summary, pendingSelections, whatsappUrl });
})(globalThis);

