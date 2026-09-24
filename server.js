const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'consultas.jsonl');
fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Validación (misma lógica que en el navegador) ----
const AREAS = ['societario', 'tributario', 'laboral', 'contable', 'contratos', 'litigios'];
const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function cuitValido(raw) {
  const c = String(raw).replace(/\D/g, '');
  if (c.length !== 11) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((a, p, i) => a + p * Number(c[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(c[10]);
}

function validar(b) {
  const d = {
    nombre: clean(b.nombre, 100),
    email: clean(b.email, 120).toLowerCase(),
    telefono: clean(b.telefono, 30),
    empresa: clean(b.empresa, 120),
    cuit: clean(b.cuit, 13),
    area: clean(b.area, 20),
    // el mensaje conserva saltos de línea
    mensaje: String(b.mensaje ?? '').replace(/[^\S\n]+/g, ' ').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, 2000),
    consentimiento: b.consentimiento === true,
  };
  const e = {};
  if (d.nombre.length < 5 || !/^[\p{L}][\p{L}\s'.-]+$/u.test(d.nombre)) e.nombre = 'Ingrese nombre y apellido completos.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'Ingrese un correo electrónico válido.';
  if (!/^\+?[\d\s()-]{8,20}$/.test(d.telefono) || d.telefono.replace(/\D/g, '').length < 8) e.telefono = 'Ingrese un teléfono con código de área.';
  if (d.empresa.length < 2) e.empresa = 'Ingrese la razón social.';
  if (!cuitValido(d.cuit)) e.cuit = 'El CUIT no es válido. Verifique los 11 dígitos.';
  if (!AREAS.includes(d.area)) e.area = 'Seleccione un área.';
  if (d.mensaje.length < 30) e.mensaje = 'Describa el asunto en al menos 30 caracteres.';
  if (!d.consentimiento) e.consentimiento = 'Debe aceptar el tratamiento de datos para continuar.';
  return { d, e };
}

// ---- API ----
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados envíos. Intente nuevamente en unos minutos.' },
});

app.post('/api/consultas', limiter, (req, res) => {
  // Honeypot: los bots completan este campo oculto
  if (req.body && req.body.web) return res.status(201).json({ ok: true, referencia: 'CON-0000' });

  const { d, e } = validar(req.body || {});
  if (Object.keys(e).length) return res.status(422).json({ ok: false, errores: e });

  const referencia = 'CON-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const registro = { referencia, fecha: new Date().toISOString(), ip: req.ip, ...d };
  fs.appendFile(FILE, JSON.stringify(registro) + '\n', (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ ok: false, error: 'No pudimos registrar la consulta. Intente nuevamente.' });
    }
    // Aquí puede sumar el envío de e-mail (nodemailer) o una integración con su CRM.
    res.status(201).json({ ok: true, referencia });
  });
});

app.listen(PORT, () => console.log(`Estudio en http://localhost:${PORT}`));