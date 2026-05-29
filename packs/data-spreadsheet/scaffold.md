# Data / Spreadsheet pack scaffold

You are working on spreadsheet manipulation, data transforms, or tabular workflows.

## Defaults
- Polars > pandas when dataset > 1M rows (lazy evaluation, faster)
- CSV: assume UTF-8 + `,` delimiter unless schema says otherwise
- Excel: openpyxl for read/write, xlsxwriter for formatting
- Google Sheets: gspread + service account auth

## Compression hint
For datasets > 10K rows, prefer SQL-style operations (group_by, agg, pivot) over row-by-row loops.
Show schema (dtype per column) before transforming.
Validate output shape (row count, null count) after every transform.

## Privacy
If data has PII columns (email, phone, SSN), mask before sharing.
Never inline PII in error messages or logs.
