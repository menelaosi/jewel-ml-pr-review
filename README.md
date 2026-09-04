# Jewel ML Review

## Verdict

**Request changes.**

These files contain security and privacy risks, along with latency issues caused by synchronous work that should be asynchronous.

## Findings

### Python endpoint: [complete_the_look.py](services/recs_api/placements/complete_the_look.py)

### 1. Synchronous MongoDB calls block the async endpoint

The route is declared with `async def`, but the module creates a synchronous `MongoClient` and then calls its blocking `find_one()` and `find()` methods. Those calls run directly on the event-loop thread at [lines 23-26](services/recs_api/placements/complete_the_look.py#L23-L26), so while MongoDB is waiting on I/O, that worker cannot make progress on other requests handled by the same loop. Under catalog or network latency, this can turn a nominally concurrent endpoint into a queue of blocked requests.

This is not just a style mismatch: an `async def` function only yields when it awaits an async operation. FastAPI's [async and await documentation](https://fastapi.tiangolo.com/async/) explains the distinction between awaitable, non-blocking libraries and blocking code, while MongoDB's [PyMongo asynchronous guide](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/) documents using `AsyncMongoClient` for asynchronous database operations. Use the async client and await its operations, or deliberately run synchronous database work in an appropriate thread pool rather than blocking the event loop.

See the synchronous client construction in [complete_the_look.py](services/recs_api/placements/complete_the_look.py#L12) and the blocking calls in [complete_the_look.py](services/recs_api/placements/complete_the_look.py#L23-L26).

### 2. The query limit needs validation and should be pushed into the database query

`limit=12` is a reasonable default, but [line 21](services/recs_api/placements/complete_the_look.py#L21) accepts any integer. A negative value has surprising Python slicing behavior (`ranked[:-1]` returns every item except the last), while an arbitrarily large value can produce a very large response and add ranking, serialization, and network latency. Apply a product-appropriate lower and upper bound, such as `ge=1` and a conservative `le` value, using FastAPI's [query parameter validation](https://fastapi.tiangolo.com/tutorial/query-params-str-validations/).

There is also no database-side limit: `catalog.find(...)` is converted to a full list before `ranked[:limit]` is applied. Even with the default of 12, the endpoint may fetch and rank every same-category item. The implementation should bound the candidate query or otherwise use a deliberate retrieval strategy, and should use MongoDB's [cursor limit](https://www.mongodb.com/docs/manual/reference/method/cursor.limit/) where that matches the ranking requirements. The cap must account for whether ranking needs a larger candidate pool, but it should never be unbounded.

### 3. Missing anchor handling causes an unhandled failure

The API assumes that `catalog.find_one()` always returns a document, then accesses `anchor["category"]`. A missing SKU therefore raises an unhandled exception. This is especially risky because the catalog is described as frequently incomplete. Return an intentional not-found or empty recommendation response instead.

See the unchecked lookup in [complete_the_look.py](services/recs_api/placements/complete_the_look.py#L23) and the failing access in [complete_the_look.py](services/recs_api/placements/complete_the_look.py#L25).

### TypeScript widget: [complete-the-look.ts](src/placements/complete-the-look.ts)

### 4. Synchronous XHR blocks the host page

`xhr.open('GET', endpoint, false)` makes the embedded widget perform a blocking request. From the [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/open#async):
> Synchronous requests on the main thread can be easily disruptive to the user experience and should be avoided; in fact, many browsers have deprecated synchronous XHR support on the main thread entirely. Synchronous requests are permitted in [`Worker`](https://developer.mozilla.org/en-US/docs/Web/API/Worker)s.

Pass `true` for the optional `async` parameter, or leave that parameter out entirely, to make the request asynchronous. Do not pass `false` explicitly. The response should then be handled from the request's completion callback rather than rendered before the data arrives.

See the blocking request in [complete-the-look.ts](src/placements/complete-the-look.ts#L61).

### 5. The widget has no request or response error handling

The widget parses the response without checking the XHR status or handling malformed JSON. A network failure, non-JSON error response, or unexpected payload can therefore throw inside the client's live page and prevent the widget from rendering. Handle request failures and parsing errors, and fail in a contained way that does not disrupt the host page.

See the unguarded parse in [complete-the-look.ts](src/placements/complete-the-look.ts#L64).

### 6. Unescaped `innerHTML` interpolation creates an XSS risk

Client-managed catalog fields are interpolated directly into an HTML string. `item.url`, `item.image.url`, `item.image.alt`, `item.title`, `item.sku`, and `item.brand` can all contain attacker-controlled or malformed content. The widget should escape values before interpolation or construct the DOM with text and attribute APIs.

See the interpolation in [complete-the-look.ts](src/placements/complete-the-look.ts#L67-L74).

### 7. `shopperEmail` is logged in the browser

The widget logs `shopperEmail` unconditionally. Shopper email is PII and should not be sent to the browser console, especially in a widget embedded on third-party storefronts. More generally, `console.log` should be avoided in production. If this information is needed for diagnostics, it should be handled through server-side logging, as in the Python endpoint; even there, `shopper_id` should be sufficient without also logging the email.

See the log payload in [complete-the-look.ts](src/placements/complete-the-look.ts#L84).

### 8. `popstate` listeners accumulate on every mount

Every call to `mountCompleteTheLook` adds a new `popstate` listener. Because the listener calls `mountCompleteTheLook` again, each navigation adds another listener and causes subsequent navigations to trigger duplicate renders and requests. Keep the listener's lifecycle separate from rendering: register it once, or remove the previous listener before registering a replacement. A mount guard can also prevent duplicate registration when the same container is mounted again.

See the listener registration in [complete-the-look.ts](src/placements/complete-the-look.ts#L53).

### Loader snippet: [jewel-loader.js](snippets/jewel-loader.js)

### 9. The generic loader hardcodes a client integration ID

The drop-in loader passes `'victorias-secret'` to the generic widget. That cannot be the production snippet for arbitrary clients and looks like a test artifact. The integration ID should be supplied through client configuration or the client-specific snippet and not hard-coded like this.

See the hardcoded value in [jewel-loader.js](snippets/jewel-loader.js#L12).

## What is fine

### Python endpoint: [complete_the_look.py](services/recs_api/placements/complete_the_look.py)

- The endpoint has a clear, focused responsibility: it finds the anchor product, selects same-category candidates, ranks them, and shapes the response. Separating candidate scoring from request handling keeps the route easy to follow; see [lines 23-27](services/recs_api/placements/complete_the_look.py#L23-L27).
- The response explicitly selects the fields exposed to the client and provides a stable nested shape for image and price data. That matches the widget's `CatalogItem` contract and avoids returning entire catalog documents; see [lines 34-44](services/recs_api/placements/complete_the_look.py#L34-L44).
- Server-side logging includes useful integration, SKU, shopper, and candidate-count context for operations. Because `shopper_id` can be personally identifiable information, this should be reviewed against applicable privacy requirements, retention policies, access controls, and consent expectations before production use; see [lines 29-32](services/recs_api/placements/complete_the_look.py#L29-L32).

### TypeScript widget: [complete-the-look.ts](src/placements/complete-the-look.ts)

- The widget keeps its expected item shape close to the rendering code through the `CatalogItem` interface; see [lines 34-41](src/placements/complete-the-look.ts#L34-L41). The image and price properties could move to separate interfaces if they are reused elsewhere, but the current structure is reasonable for this file.
- Creating the style element in code makes the widget self-contained and avoids requiring a separate stylesheet request. Keeping styles near the component is reasonable for a small bundle, although the generic `img`, `h3`, and `p` selectors should eventually be scoped to the widget so they cannot affect the host page; see [lines 4-30](src/placements/complete-the-look.ts#L4-L30) and [lines 48-50](src/placements/complete-the-look.ts#L48-L50).
- The widget renders a compact horizontal product layout and includes useful product, image, price, and SKU data in each item. The rendering contract is easy to identify in [lines 66-77](src/placements/complete-the-look.ts#L66-L77), subject to the escaping and error-handling fixes noted above.
- The URL construction could be hardened by applying `encodeURIComponent()` to `integrationId` and `sku`. A configurable API host could also support different environments, but a fixed production host is reasonable for a lightweight client widget, so I would not treat the `const endpoint` declaration as a finding by itself.

### Loader snippet: [jewel-loader.js](snippets/jewel-loader.js)

- The no-framework, vanilla-JavaScript approach is appropriate for an embedded bundle with an explicit bundle-size constraint on the client's critical path.
- The loader is small and self-contained: its immediately invoked function avoids leaking temporary variables into the global scope; see [lines 4-7](snippets/jewel-loader.js#L4-L7).
- Waiting for the external script's `load` event before calling `mountCompleteTheLook` establishes the necessary script ordering. Deriving the SKU from the current path also keeps the snippet configuration light; see [lines 9-12](snippets/jewel-loader.js#L9-L12). The integration ID still needs to come from client-specific configuration, as noted above.

## Walkthrough

[Watch the video walkthrough of this review](https://drive.google.com/file/d/1S1b5HyYIhpFHdT2lHfnD-v2H41Pe5Imj/view?usp=sharing).

## AI disclosure

I used Claude Code to review the three files, identify issues, refine the wording, and format this document. My initial review caught most of the TypeScript concerns, including the synchronous XHR, unhandled response parsing, unsafe HTML interpolation, and browser-side email logging. Claude Code additionally surfaced the accumulating `popstate` listeners, the hardcoded `victorias-secret` integration ID, and the implications of using synchronous PyMongo calls inside an `async def` endpoint. It also helped clarify the missing-anchor failure and the need to validate and bound the query limit.

I reviewed and edited each suggested finding rather than accepting the output unchanged. In particular, I kept the server-side `shopper_id` logging as a conditional privacy consideration, pushing back on treating it as automatically unacceptable: it may be appropriate for operations when supported by the applicable privacy, retention, access-control, and consent requirements. After pushing the changes, I also verified that the README renders correctly on GitHub. I also caught a few places where it moved something to the wrong part of the README and fixed that up before sending this out.gi