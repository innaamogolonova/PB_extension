from __future__ import annotations

from flask import Flask, jsonify, render_template, request

try:
    from request_models import CheckoutRequest, QuoteRequest
    from services import order_service
    from utils.signature_utils import build_request_signature
except ImportError:
    from tests.web_app.request_models import CheckoutRequest, QuoteRequest
    from tests.web_app.services import order_service
    from tests.web_app.utils.signature_utils import build_request_signature

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/catalog")
def catalog():
    products = order_service.get_catalog()
    return jsonify({"products": products, "count": len(products)})


@app.post("/api/quote")
def quote():
    payload = request.get_json(silent=True) or {}
    quote_request = QuoteRequest.from_payload(payload)

    request_signature = build_request_signature(
        path=request.path,
        method=request.method,
        payload=payload,
        headers=dict(request.headers)
    )

    quote_result = order_service.compute_quote(quote_request)

    return jsonify(
        {
            "request_signature": request_signature,
            "request_shape": quote_request.shape,
            "quote": quote_result,
        }
    )


@app.post("/api/checkout")
def checkout():
    payload = request.get_json(silent=True) or {}
    checkout_request = CheckoutRequest.from_payload(payload)

    request_signature = build_request_signature(
        path=request.path,
        method=request.method,
        payload=payload,
        headers=dict(request.headers)
    )

    receipt = order_service.process_checkout(checkout_request)

    return jsonify(
        {
            "request_signature": request_signature,
            "request_shape": checkout_request.shape,
            "receipt": receipt,
        }
    )


if __name__ == "__main__":
    # debug=True is useful for extension tracing demos
    app.run(host="127.0.0.1", port=5050, debug=True)
