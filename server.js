const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8787;
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => {
  res.send(`<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>ReceiptLens VAT Extractor</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f4f8f6;color:#10231b}.wrap{max-width:960px;margin:0 auto;padding:24px}h1{font-size:42px;margin:0 0 8px}.card{background:#fff;border:1px solid #d8e6de;border-radius:14px;padding:18px;margin:14px 0}.btn{display:inline-block;background:#2ea36b;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;border:0;cursor:pointer}.muted{color:#567067}.pill{display:inline-block;font-size:12px;background:#eaf6ef;color:#1f7d52;padding:4px 8px;border-radius:999px}</style></head><body><div class='wrap'><span class='pill'>MVP shell</span><h1>ReceiptLens VAT Extractor</h1><p class='muted'>Upload invoice PDFs/photos and export accounting-ready CSV (date, vendor, VAT, net, gross).</p><div class='card'><h3>Upload demo</h3><form action='/upload' method='post' enctype='multipart/form-data'><input type='file' name='docs' multiple accept='.pdf,.jpg,.jpeg,.png'/><p><button class='btn' type='submit'>Upload files</button></p></form><p class='muted'>Current cap target: 30 docs/month free • Stripe: coming soon</p></div><div class='card'><h3>Pricing (stub)</h3><ul><li>Free: 30 docs/month</li><li>Starter: €12/month (300 docs)</li><li>Pro: €29/month (1,500 docs)</li></ul></div></div></body></html>`);
});

app.post('/upload', upload.array('docs', 20), (req, res) => {
  const files = (req.files || []).map(f => ({ name: f.originalname, savedAs: f.filename, size: f.size }));
  res.json({ ok: true, uploaded: files.length, files, note: 'OCR + extraction pipeline next step.' });
});

app.get('/health', (_, res) => res.json({ ok: true, app: 'receiptlens', ts: Date.now() }));

app.listen(port, () => console.log(`ReceiptLens listening on ${port}`));
