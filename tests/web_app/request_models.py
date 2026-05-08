from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class QuoteRequest:
    user_id: str
    product_id: str
    quantity: int
    discount_code: str | None

    @property
    def shape(self) -> dict[str, str]:
        return {
            "user_id": "str",
            "product_id": "str",
            "quantity": "int",
            "discount_code": "str | null",
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "QuoteRequest":
        user_id = str(payload.get("user_id", "guest"))
        product_id = str(payload.get("product_id", ""))
        quantity = int(payload.get("quantity", 1))
        discount_code_raw = payload.get("discount_code")
        discount_code = str(discount_code_raw) if discount_code_raw else None

        if not product_id:
            raise ValueError("product_id is required")

        if quantity <= 0:
            raise ValueError("quantity must be > 0")

        return cls(
            user_id=user_id,
            product_id=product_id,
            quantity=quantity,
            discount_code=discount_code,
        )


@dataclass
class CheckoutRequest:
    user_id: str
    product_id: str
    quantity: int
    payment_token: str
    shipping_country: str

    @property
    def shape(self) -> dict[str, str]:
        return {
            "user_id": "str",
            "product_id": "str",
            "quantity": "int",
            "payment_token": "str",
            "shipping_country": "str",
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CheckoutRequest":
        user_id = str(payload.get("user_id", "guest"))
        product_id = str(payload.get("product_id", ""))
        quantity = int(payload.get("quantity", 1))
        payment_token = str(payload.get("payment_token", ""))
        shipping_country = str(payload.get("shipping_country", "US"))

        if not product_id:
            raise ValueError("product_id is required")

        if not payment_token:
            raise ValueError("payment_token is required")

        if quantity <= 0:
            raise ValueError("quantity must be > 0")

        return cls(
            user_id=user_id,
            product_id=product_id,
            quantity=quantity,
            payment_token=payment_token,
            shipping_country=shipping_country,
        )
