// Универсальное окно-форма (добавить ученика, создать пробник, сообщения импорта).
import { $, el } from './util.js';
import { t } from './i18n.js';

let current = null;

export function closeForm() {
  const d = $('#formDialog');
  if (d.open) d.close();
  current = null;
}

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.message]          текст (переносы строк сохраняются)
 * @param {Array} [o.fields]            { name, label, type: text|date|segmented|checkbox, value, options, list, required }
 * @param {string} o.submit             надпись на главной кнопке
 * @param {Function} o.onSubmit         (values) => null | 'текст ошибки' (может быть async)
 * @param {{label, confirm, action}} [o.danger]  красная кнопка (удалить)
 */
export function openForm(o) {
  current = o;
  const d = $('#formDialog');
  $('#formTitle').textContent = o.title;
  const body = $('#formBody');
  body.textContent = '';
  if (o.message) body.append(el('p', { class: 'form-message', text: o.message }));
  const inputs = {};
  for (const f of o.fields ?? []) {
    const id = `f_${f.name}`;
    if (f.type === 'segmented') {
      const wrap = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': f.label });
      for (const [val, label] of f.options) {
        const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(val === f.value), 'data-value': val, text: label,
          onclick: () => { wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b))); } });
        wrap.append(b);
      }
      inputs[f.name] = () => wrap.querySelector('[aria-checked=true]')?.dataset.value;
      body.append(el('div', { class: 'field' }, el('span', { class: 'field-label', text: f.label }), wrap));
    } else if (f.type === 'checkbox') {
      const cb = el('input', { type: 'checkbox', id, checked: f.value || null });
      inputs[f.name] = () => cb.checked;
      body.append(el('label', { class: 'field-check', for: id }, cb, el('span', { text: f.label })));
    } else {
      const listId = f.list?.length ? `${id}_list` : null;
      const inp = el('input', { id, type: f.type || 'text', value: f.value ?? '', required: f.required || null, list: listId, autocomplete: f.autocomplete || null, enterkeyhint: 'done' });
      inputs[f.name] = () => inp.value;
      body.append(el('div', { class: 'field' }, el('label', { class: 'field-label', for: id, text: f.label }), inp,
        listId ? el('datalist', { id: listId }, f.list.map(v => el('option', { value: v }))) : null));
    }
  }
  const err = el('p', { class: 'form-error', role: 'alert' });
  body.append(err);
  const submit = $('#formSubmit');
  submit.textContent = o.submit;
  const danger = $('#formDanger');
  danger.hidden = !o.danger;
  if (o.danger) danger.textContent = o.danger.label;

  $('#formEl').onsubmit = async e => {
    e.preventDefault();
    if (current !== o) return;
    submit.disabled = true;
    try {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, get]) => [k, get()]));
      const problem = await o.onSubmit(values);
      if (problem) { err.textContent = problem; return; }
      closeForm();
    } catch (ex) {
      console.error(ex);
      err.textContent = ex.message || String(ex);
    } finally {
      submit.disabled = false;
    }
  };
  danger.onclick = async () => {
    if (!o.danger || !window.confirm(o.danger.confirm)) return;
    await o.danger.action();
    closeForm();
  };
  $('#formCancel').onclick = () => closeForm();
  d.showModal();
  const first = body.querySelector('input:not([type=checkbox])');
  if (first && !first.value) first.focus();
}

export function initForm() {
  $('#formCancel').textContent = t('form.cancel');
  document.addEventListener('langchange', () => { $('#formCancel').textContent = t('form.cancel'); });
}
