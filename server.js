const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8787;
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || '';

const extractDateFromText = (txt) => {
  if (!txt) return '';
  const t = String(txt);
  const patterns = [
    /(\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b)/,      // YYYY-MM-DD
    /(\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b)/,      // DD/MM/YYYY
    /(\b\d{1,2}[. ]\d{1,2}[. ]\d{4}\b)/           // DD.MM.YYYY
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m && m[1]) return m[1].replace(/\./g, '/').replace(/\s+/g, '/');
  }
  return '';
};

const normalizeToISODate = (raw) => {
  if (!raw) return '';
  const s = raw.replace(/\s+/g, '/').replace(/-/g, '/');
  const parts = s.split('/').map(x => x.trim());
  if (parts.length !== 3) return '';
  if (parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  let [d, m, y] = parts;
  if (y.length === 2) y = `20${y}`;
  return `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
};

const extractFuelFieldsFromText = (txt) => {
  const t = String(txt || '');
  const date = normalizeToISODate(extractDateFromText(t));

  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const station = lines.find(l => /(eko|petrolina|shell|bp|lukoil|agip|eni|texaco|fuel|station)/i.test(l)) || '';

  const num = (s) => {
    if (!s) return '';
    const cleaned = s.replace(',', '.').replace(/[^0-9.]/g, '');
    return cleaned && !isNaN(Number(cleaned)) ? Number(cleaned).toFixed(2) : '';
  };

  const totalMatch = t.match(/(?:total|amount|sum|payable|eur|€)\s*[:\-]?\s*([0-9]+[.,][0-9]{1,2})/i) || t.match(/([0-9]+[.,][0-9]{2})\s*(?:€|eur)/i);
  const priceMatch = t.match(/(?:price\s*\/\s*l|price\s*per\s*liter|€/\s*l|eur\s*\/\s*l|unit\s*price)\s*[:\-]?\s*([0-9]+[.,][0-9]{2,3})/i);
  const litersMatch = t.match(/(?:liters|litres|l)\s*[:\-]?\s*([0-9]+[.,][0-9]{2,3})/i) || t.match(/([0-9]+[.,][0-9]{2,3})\s*(?:liters|litres|l)\b/i);

  return {
    date,
    station,
    total: num(totalMatch && totalMatch[1]),
    pricePerLiter: num(priceMatch && priceMatch[1]),
    liters: num(litersMatch && litersMatch[1])
  };
};

const ocrExtractFields = async (filePath) => {
  if (!OCR_SPACE_API_KEY) return { fields: {}, parsedText: '', error: 'OCR key missing' };
  try {
    const ext = (path.extname(filePath || '').toLowerCase());
    if (ext === '.pdf') {
      return { fields: {}, parsedText: '', error: 'PDF OCR not enabled yet; please upload image for now' };
    }

    const b64 = fs.readFileSync(filePath, { encoding: 'base64' });
    const payload = new URLSearchParams();
    payload.append('apikey', OCR_SPACE_API_KEY);
    payload.append('base64Image', `data:image/jpeg;base64,${b64}`);
    payload.append('language', 'eng');
    payload.append('isOverlayRequired', 'false');

    const resp = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });
    const data = await resp.json();
    const parsedText = (data?.ParsedResults || []).map(x => x?.ParsedText || '').join('\n');
    const fields = extractFuelFieldsFromText(parsedText);
    return { fields, parsedText, error: '' };
  } catch {
    return { fields: {}, parsedText: '', error: 'OCR request failed' };
  }
};
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ fuelEntries: [], reminders: [] }, null, 2));
}

const readDb = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const writeDb = (db) => fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

const shell = (title, body) => `<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>${title}</title><style>
:root{--green:#2ea36b;--bg:#f4f8f6;--text:#10231b;--muted:#567067;--line:#d8e6de}
*{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text)}
.wrap{max-width:1100px;margin:0 auto;padding:24px} .top{display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.brand{font-weight:800;font-size:22px} .nav a{margin-right:10px;color:#1c4b39;text-decoration:none;font-weight:600}
.hero{padding:34px 0 16px} h1{font-size:clamp(34px,6vw,58px);margin:0 0 10px;line-height:1.03}
.muted{color:var(--muted)} .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin:14px 0;box-shadow:0 10px 24px rgba(16,42,31,.08)}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px} .grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.btn{display:inline-block;background:var(--green);color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none;border:0;cursor:pointer;font-weight:700}
.btn.alt{background:#fff;color:#1f7d52;border:1px solid #9fcfb8} input,select{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #edf2ef;text-align:left;font-size:14px}
.pill{display:inline-block;font-size:12px;background:#eaf6ef;color:#1f7d52;padding:4px 8px;border-radius:999px}
@media(max-width:900px){.grid,.grid-2{grid-template-columns:1fr}}
</style></head><body><div class='wrap'><div class='top'><div class='brand'>ReceiptLens</div><div class='nav'><a href='/'>Home</a><a href='/track'>Track Fuel</a><a href='/maintenance'>Maintenance</a><a href='/dashboard'>Dashboard</a></div></div>${body}</div></body></html>`;

app.get('/', (_, res) => {
  res.send(shell('ReceiptLens — Fuel & Car Cost Tracker', `
    <section class='hero'>
      <span class='pill'>New micro-SaaS</span>
      <h1>Track fuel cost, cost/km, and car renewals in one place.</h1>
      <p class='muted'>Upload fuel receipts, extract liters and price per liter, add odometer, and stay ahead of insurance, road tax, MOT and oil change renewals.</p>
      <p><a class='btn' href='/track'>Start Tracking</a> <a class='btn alt' href='/dashboard'>See Dashboard</a></p>
    </section>

    <div class='grid'>
      <article class='card'><h3>Receipt Upload</h3><p class='muted'>Upload PDF/JPG/PNG from gas stations and auto-create entries.</p></article>
      <article class='card'><h3>Cost per Km</h3><p class='muted'>Track fuel spend and estimate driving distance on current fuel.</p></article>
      <article class='card'><h3>Renewal Reminders</h3><p class='muted'>Never miss insurance, road tax, MOT, or oil change due dates.</p></article>
    </div>

    <div class='card'>
      <h3>Pricing (launch offer)</h3>
      <div class='grid-2'>
        <div><strong>Free</strong><br><span class='muted'>30 docs/month • 1 vehicle</span></div>
        <div><strong>Pro €7/mo</strong><br><span class='muted'>Unlimited docs • multi-vehicle • priority processing</span></div>
      </div>
    </div>
  `));
});

app.get('/track', (req, res) => {
  const db = readDb();
  const prefillDate = (req.query.date || '').toString();
  const prefillStation = (req.query.station || '').toString();
  const prefillTotal = (req.query.total || '').toString();
  const prefillPrice = (req.query.pricePerLiter || '').toString();
  const prefillLiters = (req.query.liters || '').toString();
  const rows = db.fuelEntries.slice().reverse();
  const tableRows = rows.map(r => `<tr><td>${r.date || ''}</td><td>${r.station || ''}</td><td>${r.total || ''}</td><td>${r.pricePerLiter || ''}</td><td>${r.liters || ''}</td><td>${r.odometer || ''}</td><td>${r.kmEstimate || ''}</td></tr>`).join('');
  res.send(shell('Track Fuel', `
    <h1>Fuel Tracking</h1>
    <div class='card'>
      <h3>Upload Fuel Receipt</h3>
      <form action='/upload' method='post' enctype='multipart/form-data'>
        <input type='file' name='docs' multiple accept='.pdf,.jpg,.jpeg,.png'>
        <p class='muted'>OCR tries to auto-fill receipt date, station, total, €/L and liters (best with clear photos).</p>
        <p><button class='btn' type='submit'>Upload</button></p>
      </form>
    </div>

    <div class='card'>
      <h3>Add Entry</h3>
      <form action='/fuel' method='post' class='grid-2'>
        <div><label>Date</label><input type='date' name='date' value='${prefillDate}' required></div>
        <div><label>Gas Station</label><input name='station' value='${prefillStation}' placeholder='e.g. EKO Latsia' required></div>
        <div><label>Total (€)</label><input name='total' value='${prefillTotal}' placeholder='e.g. 62.40' required></div>
        <div><label>Price per Liter (€)</label><input name='pricePerLiter' value='${prefillPrice}' placeholder='e.g. 1.47' required></div>
        <div><label>Total Liters</label><input name='liters' value='${prefillLiters}' placeholder='e.g. 42.45' required></div>
        <div><label>Odometer (km)</label><input name='odometer' placeholder='e.g. 128440'></div>
        <div><label>Estimated km with current fuel</label><input name='kmEstimate' placeholder='e.g. 530'></div>
        <div style='align-self:end'><button class='btn' type='submit'>Save Entry</button></div>
      </form>
    </div>

    <div class='card'>
      <h3>Recent Fuel Entries</h3>
      <table><thead><tr><th>Date</th><th>Station</th><th>Total €</th><th>€/L</th><th>Liters</th><th>Odometer</th><th>Estimated km</th></tr></thead><tbody>${tableRows || '<tr><td colspan="7">No entries yet.</td></tr>'}</tbody></table>
    </div>
  `));
});

app.post('/fuel', (req, res) => {
  const db = readDb();
  db.fuelEntries.push({
    id: Date.now().toString(),
    date: req.body.date || '',
    station: req.body.station || '',
    total: req.body.total || '',
    pricePerLiter: req.body.pricePerLiter || '',
    liters: req.body.liters || '',
    odometer: req.body.odometer || '',
    kmEstimate: req.body.kmEstimate || ''
  });
  writeDb(db);
  res.redirect('/track');
});

app.get('/maintenance', (_, res) => {
  const db = readDb();
  const rows = db.reminders.slice().reverse();
  const list = rows.map(r => `<tr><td>${r.type}</td><td>${r.dueAt}</td><td>${r.notes || ''}</td></tr>`).join('');
  res.send(shell('Maintenance & Renewals', `
    <h1>Maintenance & Renewals</h1>
    <div class='card'>
      <form action='/maintenance' method='post' class='grid-2'>
        <div><label>Type</label><select name='type'><option>Oil change</option><option>Insurance</option><option>Road tax</option><option>MOT</option><option>Other</option></select></div>
        <div><label>Due date & time</label><input type='datetime-local' name='dueAt' required></div>
        <div style='grid-column:1/-1'><label>Notes</label><input name='notes' placeholder='optional'></div>
        <div><button class='btn' type='submit'>Add Reminder</button></div>
      </form>
    </div>
    <div class='card'>
      <h3>Upcoming</h3>
      <table><thead><tr><th>Type</th><th>Due</th><th>Notes</th></tr></thead><tbody>${list || '<tr><td colspan="3">No reminders yet.</td></tr>'}</tbody></table>
    </div>
  `));
});

app.post('/maintenance', (req, res) => {
  const db = readDb();
  db.reminders.push({ id: Date.now().toString(), type: req.body.type || 'Other', dueAt: req.body.dueAt || '', notes: req.body.notes || '' });
  writeDb(db);
  res.redirect('/maintenance');
});

app.get('/dashboard', (_, res) => {
  const db = readDb();
  const totals = db.fuelEntries.reduce((acc, r) => {
    acc.total += parseFloat(r.total || 0) || 0;
    acc.liters += parseFloat(r.liters || 0) || 0;
    return acc;
  }, { total: 0, liters: 0 });
  const avg = totals.liters > 0 ? (totals.total / totals.liters) : 0;
  res.send(shell('Dashboard', `
    <h1>Dashboard</h1>
    <div class='grid'>
      <div class='card'><h3>Total Fuel Spend</h3><p><strong>€${totals.total.toFixed(2)}</strong></p></div>
      <div class='card'><h3>Total Liters</h3><p><strong>${totals.liters.toFixed(2)} L</strong></p></div>
      <div class='card'><h3>Avg Price per Liter</h3><p><strong>€${avg.toFixed(3)}</strong></p></div>
    </div>
    <div class='card'><p class='muted'>Next step: add monthly trends, cost/km, OCR confidence flags, and CSV export.</p></div>
  `));
});

app.post('/upload', upload.array('docs', 20), async (req, res) => {
  const files = req.files || [];
  const mapped = files.map(f => ({ name: f.originalname, savedAs: f.filename, size: f.size, path: f.path }));
  const list = mapped.map(f => `<li>${f.name} (${Math.round((f.size||0)/1024)} KB)</li>`).join('');

  let fields = { date: '', station: '', total: '', pricePerLiter: '', liters: '' };
  let ocrError = '';
  if (mapped[0]) {
    const out = await ocrExtractFields(mapped[0].path);
    fields = { ...fields, ...(out.fields || {}) };
    ocrError = out.error || '';
  }

  const qs = new URLSearchParams();
  Object.entries(fields).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
  const prefillUrl = `/track${qs.toString() ? `?${qs.toString()}` : ''}`;

  res.send(shell('Upload Complete', `
    <h1>Receipt uploaded</h1>
    <p class='muted'>Uploaded <strong>${mapped.length}</strong> file(s) successfully.</p>
    ${mapped.length ? `<div class='card'><h3>Uploaded files</h3><ul>${list}</ul></div>` : ''}
    <div class='card'>
      <h3>OCR extracted fields</h3>
      <table><tbody>
        <tr><th>Date</th><td>${fields.date || '—'}</td></tr>
        <tr><th>Gas Station</th><td>${fields.station || '—'}</td></tr>
        <tr><th>Total (€)</th><td>${fields.total || '—'}</td></tr>
        <tr><th>Price per Liter (€)</th><td>${fields.pricePerLiter || '—'}</td></tr>
        <tr><th>Total Liters</th><td>${fields.liters || '—'}</td></tr>
      </tbody></table>
      ${ocrError ? `<p class='muted'>${ocrError}</p>` : ''}
      <p><a class='btn' href='${prefillUrl}'>Use extracted values in Track Fuel</a></p>
      <p class='muted'>You can edit anything before saving.</p>
    </div>
  `));
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.use((_, res) => res.status(404).json({ ok: false, error: 'not found' }));

app.listen(port, () => console.log(`ReceiptLens listening on ${port}`));
