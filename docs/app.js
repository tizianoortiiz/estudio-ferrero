(() => {
  const form = document.getElementById('form');
  const estado = document.getElementById('estado');
  const btn = document.getElementById('enviar');
  const cnt = document.getElementById('cnt');
  const AREAS = ['societario', 'tributario', 'laboral', 'contable', 'contratos', 'litigios'];

  function cuitValido(raw) {
    const c = raw.replace(/\D/g, '');
    if (c.length !== 11) return false;
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const suma = pesos.reduce((a, p, i) => a + p * Number(c[i]), 0);
    let dv = 11 - (suma % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) return false;
    return dv === Number(c[10]);
  }

  const reglas = {
    nombre: v => v.trim().length >= 5 && /^[\p{L}][\p{L}\s'.-]+$/u.test(v.trim()) || 'Ingrese nombre y apellido completos.',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Ingrese un correo electrónico válido.',
    telefono: v => (/^\+?[\d\s()-]{8,20}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 8) || 'Ingrese un teléfono con código de área.',
    empresa: v => v.trim().length >= 2 || 'Ingrese la razón social.',
    cuit: v => cuitValido(v) || 'El CUIT no es válido. Verifique los 11 dígitos.',
    area: v => AREAS.includes(v) || 'Seleccione un área.',
    mensaje: v => v.trim().length >= 30 || 'Describa el asunto en al menos 30 caracteres.',
    consentimiento: (_, el) => el.checked || 'Debe aceptar el tratamiento de datos para continuar.',
  };

  function mostrar(campo, msg) {
    const el = form.elements[campo];
    const cont = el.closest('.f');
    document.getElementById('e-' + campo).textContent = msg || '';
    cont.classList.toggle('bad', !!msg);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) el.setAttribute('aria-describedby', 'e-' + campo); else el.removeAttribute('aria-describedby');
  }

  function validarCampo(campo) {
    const el = form.elements[campo];
    const r = reglas[campo](el.value, el);
    mostrar(campo, r === true ? '' : r);
    return r === true;
  }

  // Formato de CUIT mientras se escribe: 30-12345678-9
  form.elements.cuit.addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length > 10 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
      : d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  });

  form.elements.mensaje.addEventListener('input', e => { cnt.textContent = `${e.target.value.length} / 2000`; });

  Object.keys(reglas).forEach(c => {
    const el = form.elements[c];
    el.addEventListener('blur', () => validarCampo(c));
    el.addEventListener('input', () => { if (el.closest('.f').classList.contains('bad')) validarCampo(c); });
    el.addEventListener('change', () => { if (el.closest('.f').classList.contains('bad')) validarCampo(c); });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    estado.textContent = '';
    const resultados = Object.keys(reglas).map(c => [c, validarCampo(c)]);
    const primero = resultados.find(([, ok]) => !ok);
    if (primero) { form.elements[primero[0]].focus(); return; }

    const body = Object.fromEntries(new FormData(form));
    body.consentimiento = form.elements.consentimiento.checked;

    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const res = await fetch('/api/consultas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        document.getElementById('panel').innerHTML =
          `<div class="ok" role="status"><h3>Consulta recibida</h3>
           <p>Un socio revisará su consulta y le responderá dentro de las 24 horas hábiles.</p>
           <p style="margin-top:14px">Número de referencia: <code>${data.referencia}</code></p></div>`;
        return;
      }
      if (res.status === 422 && data.errores) {
        Object.entries(data.errores).forEach(([c, m]) => form.elements[c] && mostrar(c, m));
        const c = Object.keys(data.errores)[0]; form.elements[c] && form.elements[c].focus();
      } else {
        estado.textContent = data.error || 'No pudimos enviar la consulta. Intente nuevamente.';
      }
    } catch {
      estado.textContent = 'Sin conexión con el servidor. Verifique su conexión e intente nuevamente.';
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar consulta';
    }
  });
})();