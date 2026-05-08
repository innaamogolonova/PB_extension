from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone

try:
    from fake_db import CATALOG, COUNTRY_TAX, DISCOUNTS
    from request_models import CheckoutRequest, QuoteRequest
except ImportError:
    from tests.web_app.fake_db import CATALOG, COUNTRY_TAX, DISCOUNTS
    from tests.web_app.request_models import CheckoutRequest, QuoteRequest


class OrderService:
    def get_catalog(self) -> list[dict[str, object]]:
        items: list[dict[str, object]] = []
        for product_id, data in CATALOG.items():
            row = {
                "product_id": product_id,
                "name": data["name"],
                "price": data["price"],
                "currency": data["currency"],
            }
            items.append(row)
        return items

    def compute_quote(self, request_data: QuoteRequest) -> dict[str, object]:
        product = CATALOG.get(request_data.product_id)
        if not product:
            raise ValueError(f"Unknown product_id: {request_data.product_id}")

        base_price = float(product["price"])
        subtotal = base_price * request_data.quantity

        discount_rate = DISCOUNTS.get(request_data.discount_code or "", 0.0)
        discount_amount = round(subtotal * discount_rate, 2)
        total = round(subtotal - discount_amount, 2)

        return {
            "product": product,
            "quantity": request_data.quantity,
            "subtotal": subtotal,
            "discount_rate": discount_rate,
            "discount_amount": discount_amount,
            "total": total,
            "currency": product["currency"],
        }

    def process_checkout(self, request_data: CheckoutRequest) -> dict[str, object]:
        product = CATALOG.get(request_data.product_id)
        if not product:
            raise ValueError(f"Unknown product_id: {request_data.product_id}")

        base_total = float(product["price"]) * request_data.quantity
        tax_rate = COUNTRY_TAX.get(request_data.shipping_country.upper(), 0.15)
        tax_amount = round(base_total * tax_rate, 2)
        final_total = round(base_total + tax_amount, 2)

        order_ref_seed = f"{request_data.user_id}:{request_data.product_id}:{datetime.now(timezone.utc).isoformat()}"
        order_ref = hashlib.sha1(order_ref_seed.encode("utf-8")).hexdigest()[:12]

        payment_auth = f"auth_{random.randint(10000, 99999)}"

        return {
            "order_ref": order_ref,
            "payment_auth": payment_auth,
            "items_total": round(base_total, 2),
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
            "final_total": final_total,
            "currency": product["currency"],
            "placed_at": datetime.now(timezone.utc).isoformat(),
        }


order_service = OrderService()
