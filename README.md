# ReceiptLens VAT Extractor (MVP shell)

Tiny web app MVP shell for invoice upload and CSV-ready extraction workflow.

## Live (Cloudflare Tunnel)
- https://receiptlens.ivansorkin.com

## Local Docker
```bash
docker compose up -d --build
# app on http://localhost:9876
```

## Current MVP in this repo
- Landing page with one-line pitch
- Upload endpoint (`/upload`) for up to 20 files
- Health endpoint (`/health`)
- Pricing stub section

## Next build steps
1. Auth (magic link)
2. OCR pipeline
3. VAT field extraction
4. Editable review table
5. CSV export
6. Usage caps + billing
