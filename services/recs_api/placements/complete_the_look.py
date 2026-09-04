# b/services/recs_api/placements/complete_the_look.py
import logging
from fastapi import APIRouter, Query
from pymongo import MongoClient

from recs_api.settings import settings
from recs_api.ranking import score_candidates

router = APIRouter()
log = logging.getLogger(__name__)

client = MongoClient(settings.mongo_uri)
catalog = client[settings.mongo_db]["catalog"]


@router.get("/v1/{integration_id}/complete-the-look")
async def complete_the_look(
    integration_id: str,
    sku: str,
    shopper_id: str | None = Query(default=None),
    limit: int = Query(default=12),
):
    anchor = catalog.find_one({"integration_id": integration_id, "sku": sku})
    candidates = list(
        catalog.find({"integration_id": integration_id, "category": anchor["category"]})
    )
    ranked = score_candidates(anchor, candidates, shopper_id=shopper_id)

    log.info(
        "complete-the-look served integration=%s sku=%s shopper=%s candidates=%d",
        integration_id, sku, shopper_id, len(candidates),
    )

    return {
        "items": [
            {
                "sku": c["sku"],
                "title": c["title"],
                "url": c["url"],
                "image": {"url": c["image"]["url"], "alt": c["title"]},
                "price": {"formatted": f"${c['price']:.2f}", "amount": c["price"]},
                "brand": c["brand"],
            }
            for c in ranked[:limit]
        ]
    }