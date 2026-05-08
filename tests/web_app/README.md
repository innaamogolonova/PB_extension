# Test Web App

Simple multi-file Python web app under tests/web_app designed for runtime-trace visibility.

## Added

- Backend entrypoint: tests/web_app/main.py:1
- Request model parsing/shape metadata: tests/web_app/request_models.py:1
- Business logic with branching and computed values: tests/web_app/services.py:1
- Fake data source: tests/web_app/fake_db.py:1
- Request signature/hash/fingerprint utilities: tests/web_app/utils/signature_utils.py:1
- Frontend page that calls backend APIs: tests/web_app/templates/index.html:1
- Package markers: tests/web_app/**init**.py:1, tests/web_app/utils/**init**.py:1

## Behavior for traces

- GET /api/catalog returns product list + count.
- POST /api/quote returns:
  - request signature metadata,
  - inferred payload shape,
  - quote calculation (subtotal/discount/total).
- POST /api/checkout returns:
  - request signature metadata,
  - payload shape,
  - receipt-like output (tax, totals, auth ref, order ref).
- Frontend makes real fetch calls to all endpoints and prints full JSON payload + response.

## Running it

- Install Flask if needed: python3 -m pip install flask
- Launch app from repo root: python3 tests/web_app/main.py
- Open: http://127.0.0.1:5050

## Running PB Extension

### Reality check first

- The command pbExtension.testDebugExecutor is still Python-file driven (src/extension.ts:99).
- It launches debug + auto-steps (src/execution/DebugExecutor.ts:147), so long-running servers (Flask app.run) are testable but a bit noisy.

### Recommended test workflow on tests/web_app

- Install dependency: python3 -m pip install flask
- Run extension and open tests/web_app/main.py in extension window.
- Start the extension command: “PB Extension: Test Debug Executor”.
- While debug session is active, call endpoints from browser:
  - http://127.0.0.1:5050/
  - use UI buttons for catalog, quote, checkout
  - or use curl/Postman for /api/quote and /api/checkout.
- Switch between files while/after requests run:
  - tests/web_app/main.py
  - tests/web_app/request_models.py
  - tests/web_app/services.py
  - tests/web_app/utils/signature_utils.py
- Hover and inline annotations should appear on lines that were executed.
- Stop debugging manually to end capture cleanly.
- Optionally run “PB Extension: Show Full Trace” to inspect saved trace output.

### What you should see

- Multi-file variable capture from one run/session.
- Values around request parsing, payload shape building, hash/signature generation, totals/tax calculations.

### Known limitations right now

- Because stepping is continuous, Flask server tracing can be verbose and less deterministic than a short script run.

## Validation

- Syntax check passed: python3 -m py_compile ... on all new app files.
