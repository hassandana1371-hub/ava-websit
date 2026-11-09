"""Build a Persian product import payload without mutating the website or database."""

import argparse
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath

DATA_FILE = Path(__file__).with_name("catalog-data.json")
UNIT_LABELS = {None: "واحد نیازمند تأیید", "piece": "هر عدد", "m2": "هر مترمربع"}


def toman_amount(record, rate, label):
    """Manual toman overrides take precedence over the supplier dollar amount."""
    override = record.get("priceOverrideToman")
    if override is not None:
        if type(override) is not int or override < 0:
            raise ValueError(f"{label}: priceOverrideToman must be a non-negative integer")
        return override

    usd = record.get("priceUsd")
    if usd is None:
        return None
    try:
        amount = Decimal(str(usd)) * rate
    except InvalidOperation as error:
        raise ValueError(f"{label}: invalid priceUsd") from error
    if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
        raise ValueError(f"{label}: USD conversion must yield a whole, non-negative toman value")
    return int(amount)


def local_asset(root, asset):
    path = PurePosixPath(asset)
    if path.is_absolute() or ".." in path.parts or len(path.parts) < 2 or path.parts[0] != "assets":
        raise ValueError(f"Invalid asset path: {asset}")
    if not root.joinpath(*path.parts).is_file():
        raise ValueError(f"Missing asset: {asset}")
    return path.as_posix()


def load_products(data_path=DATA_FILE):
    """Return sanitized product rows for an adapter to the site's existing schema."""
    data_path = Path(data_path)
    data = json.loads(data_path.read_text(encoding="utf-8"))
    rate = data["rateTomanPerUsd"]
    if type(rate) is not int or rate <= 0:
        raise ValueError("rateTomanPerUsd must be a positive integer")
    root = data_path.parent
    cover = local_asset(root, data["coverImage"])
    rebranded = {local_asset(root, path) for path in data.get("rebrandedImages", [])}
    ids = set()
    rows = []
    for record in data["products"]:
        product_id = record["id"]
        if not isinstance(product_id, str) or not product_id or product_id in ids:
            raise ValueError(f"Empty or duplicate ID: {product_id}")
        ids.add(product_id)
        if type(record.get("active", True)) is not bool:
            raise ValueError(f"{product_id}: active must be true or false")
        if not record.get("active", True):
            continue
        photos = [local_asset(root, item) for item in record["images"]]
        price = toman_amount(record, rate, product_id)
        unit = record.get("unit")
        options = [
            {
                "name": option["name"],
                "priceToman": toman_amount(option, rate, product_id),
                "priceUnit": option["unit"],
                "priceUnitLabel": UNIT_LABELS[option["unit"]],
            }
            for option in record.get("options", [])
        ]
        rows.append(
            {
                "externalId": f"ava-led-catalog:{product_id}",
                "brand": data["brand"],
                "name": record.get("displayName") or record["name"],
                "category": record["category"],
                "categoryPath": [data["parentCategory"], record["category"]],
                "series": record["series"],
                "model": record.get("model"),
                "pitch": record.get("pitch"),
                "dimensionsMm": record.get("dimensionsMm"),
                "priceToman": price,
                "priceStatus": "inquiry" if price is None else ("unit_review" if unit is None else "priced"),
                "priceUnit": unit,
                "priceUnitLabel": UNIT_LABELS[unit],
                "options": options,
                "specifications": record["specifications"],
                "images": [
                    {"path": photo, "kind": "rebranded-reference" if photo in rebranded else "supplier-reference"}
                    for photo in photos
                ],
            }
        )
    return {
        "currency": "TOMAN",
        "coverImage": cover,
        "parentCategory": data["parentCategory"],
        "categories": data["categories"],
        "removeFromParent": data["removeFromParent"],
        "products": rows,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DATA_FILE)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    payload = load_products(args.data)
    if args.output:
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Validated {len(payload['products'])} active products.")
