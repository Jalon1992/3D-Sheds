# 3D Shed Builder

A self-hosted 3D shed configurator (in the spirit of Shed Pro) with an admin back office, an Open REST API, signed webhooks and a native GoHighLevel integration.

- **Customers:** pick a Style → Size → Roof & Colors (Architectural Shingles or Ag Panel Metal) → Options → submit a Quote. Standard options are already on the shed. Customers **drag and drop** doors, windows and every other option to a new spot on the 3D model (along a wall, around a corner to another wall, across the ceiling), and click any of them to upgrade, swap or remove it. After submitting they can download their **3D model (.glb)** and a **to-scale floor plan** (SVG / print to PDF).
- **You (admin):** log in at `/admin` to manage styles, sizes & prices, colors, options (each with a built-in 3D model or your own uploaded `.glb`), quotes, GHL, webhooks, API keys and branding — with a live 3D preview while you edit.
- **Integrations:** every quote can go to GoHighLevel (contact + opportunity + note, or a workflow Inbound Webhook), to any number of webhooks (Zapier, Make, n8n, your server), and everything is available through a documented REST API (`/docs`).

---

## Quick start

Requires **Node.js 22.13 or newer** (uses Node's built-in SQLite — no database server to install).

```bash
npm install
ADMIN_EMAIL=you@yourcompany.com ADMIN_PASSWORD='pick-a-strong-one' npm start
```

Open:

| | |
|---|---|
| Configurator | http://localhost:3000/ |
| Admin | http://localhost:3000/admin/ |
| API docs (Swagger) | http://localhost:3000/docs |

The first run seeds 4 sample styles (Classic Gable, Lofted Barn, Modern Lean-To, Garage), sizes, colors and ~25 options so you can see everything working. Edit or delete them in the admin.

> If you don't set `ADMIN_EMAIL`/`ADMIN_PASSWORD` the login is `admin@example.com` / `changeme123` — change it right away in **Admin → Account & users**.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | — | First admin login (only used on the very first run) |
| `DB_PATH` | `./data/shedbuilder.db` | SQLite database file |
| `UPLOAD_DIR` | `./uploads` | Uploaded 3D models and images |
| `SESSION_SECRET` | auto-generated | Cookie signing secret |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

**Back up `data/` and `uploads/`** — that's everything (catalog, quotes, settings, models).

---

## Deploying

Any host that runs Node or Docker works. It needs a **persistent disk** for `data/` and `uploads/`.

**Render (easiest, uses the included `render.yaml`)**
1. On render.com: **New → Blueprint**, connect GitHub and pick this repo.
2. Enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` when asked, then **Apply**. Render creates the web service with a 1 GB disk (Starter plan; disks need a paid instance).
3. When it's live, open `https://<your-app>.onrender.com/admin/`, log in, and set **Settings → Public URL**.
4. Optional: add your own domain (e.g. `builder.yourcompany.com`) under the service's **Settings → Custom Domains**.

**Docker**
```bash
docker build -t shed-builder .
docker run -d -p 3000:3000 -v shed_data:/app/data -v shed_uploads:/app/uploads \
  -e ADMIN_EMAIL=you@co.com -e ADMIN_PASSWORD='…' -e COOKIE_SECURE=true shed-builder
```

**Render / Railway / Fly.io:** create a Node (or Docker) web service from this folder, add a persistent volume mounted at `/app/data` (and one for `/app/uploads`, or set `UPLOAD_DIR` inside the same volume, e.g. `/app/data/uploads`), set the env vars above, start command `npm start`.

**VPS:** `npm install --omit=dev && npm start` behind Nginx/Caddy with HTTPS, kept alive with pm2 or systemd.

After deploying, set **Admin → Settings → Public URL** (e.g. `https://builder.yourdomain.com`) so links in webhooks and GHL point to the right place.

---

## Managing the catalog

### Styles & sizes
Each style sets the **roof** (gable, barn/gambrel, lean-to, saltbox), which side faces front (gable end or long eave side), wall height, **roof pitch** (on gambrel roofs: separate **lower and upper pitch** plus where the break sits), **eave overhang** and **gable overhang** (set separately), **siding** (lap, board & batten, T1-11, metal), the standard roofing and the roofing choices, and **trim sizes in inches** (fascia height, rake trim height, corner board width, door & window trim width). The editor shows a live 3D preview.

- **Sizes:** width × depth with a base price each. Use *Fill prices* to set every size from a $/sq ft + base amount, then tweak.
- **Standard options:** items already on the shed and included in the base price (e.g. a 36" door on the front). Pick the option, the wall and an offset in feet from the wall's centre (viewed from outside, + is right). Optional **width/height** columns resize a door or window for just that style; leave them blank to use the option's own size. Customers who swap a standard item pay only the difference.
- **Default colors** per style.

### Roofing (Architectural Shingles / Ag Panel Metal)
Admin → **Roofing & colors → Roofing materials**: rename, describe and price each roofing type: per sq ft of **roof surface** (calculated from pitch and overhangs), per sq ft of floor, or flat. On each style choose the **standard roofing** (included in the base price) and which roofing types customers can pick; picking a different one charges the difference. Each roof color can be limited to shingles or metal (e.g. Galvalume only shows for Ag Panel).

### Colors
Siding, trim, roof, door and **window** colors, each with an optional upcharge. A door or window color named **“Match Trim”** automatically follows the trim color. Each color group has a **“Customers can choose”** switch; turn it off and customers no longer see that choice (the style's default color is used, and the server enforces it).

### Options & 3D models
Every option has a category, price, size and a **placement**:

| Placement | Used for |
|---|---|
| `opening` | Doors, windows, vents — cuts a real hole in the wall |
| `wall_exterior` | Flower boxes, exterior lights |
| `wall_interior` | Shelves, workbenches, outlets |
| `ceiling` | Lights |
| `loft` | Lofts — spans the full wall it's on |
| `ground` | Ramps in front of a wall |
| `roof` | Cupolas on the ridge |
| `none` | Line items / toggles with no 3D (electrical package, insulation, anchors…) |

**Pricing units:** each, per ft of the wall it's on, per ft of width/depth/perimeter, or per sq ft of floor.

**Door & window sizes:** each option's width × height (and height off the floor) is set in its editor with a live preview; per-style sizes can be overridden in the style's standard options.

**Swap group:** options with the same swap group (e.g. `door`, `window`) appear as upgrade choices when the customer clicks that item on the model.

**3D models:** pick one of the built-in procedural models (single/glass/double/French/roll-up doors, windows, shutters, transoms, vents, flower box, lights, outlets, shelf, workbench, loft, ramp, cupola) — they automatically take the customer's door/trim colors — **or upload your own `.glb`**. Custom models are scaled to the width × height × depth you enter, so export with the front facing **+Z** and **Y up**, and match the dimensions to the real product. SketchUp, Blender and most CAD tools can export `.glb`.

---

## GoHighLevel

Admin → **Integrations & API → GoHighLevel**. Use either option, or both.

### Option A — Native API (contact + opportunity + note)
1. In GHL (sub-account): **Settings → Private Integrations → Create new**. Give it the scopes **contacts.write** and **opportunities.write** (add *contacts.readonly* / *opportunities.readonly* if offered). Copy the token.
2. Copy your **Location ID** (Settings → Business Profile).
3. Optional: to create an opportunity, paste the **Pipeline ID** and **Stage ID** (visible in the pipeline settings URL / API).
4. Turn on *Send every new quote to GoHighLevel*, save, and click **Send latest quote to GHL now** to test.

Each new quote upserts the contact (name, email, phone, address, tags, source), creates an opportunity with the quote total, and adds a note with the full shed spec plus links to the 3D design and floor plan. **Custom fields** can be filled with a mapping like:

```json
{ "shed_style": "shed.style", "shed_size": "shed.size", "quote_total": "pricing.total", "shed_3d_link": "links.view_3d" }
```

(keys are your GHL custom field keys; values are paths in the Quote object below).

### Option B — Workflow “Inbound Webhook” trigger (no token)
1. GHL → **Automation → Workflows → Create** → trigger **Inbound Webhook** → copy its URL.
2. Paste it in *Inbound webhook URL* and save. Submit a test quote so GHL can see a sample payload, then map fields.
3. Add actions (Create/Update Contact, Create Opportunity, send SMS/email, assign user…).

The payload includes easy flat fields: `first_name, last_name, full_name, email, phone, address1, city, state, postal_code, quote_number, quote_total, shed_style, shed_size, shed_summary, options_list, shed_3d_link, floor_plan_link` — plus the full nested quote.

### Putting the builder on a GHL funnel/website
Admin → Integrations → **Embed / links** gives you an iframe snippet for a *Custom JS/HTML* element, direct links per style (`/?style=2`), and an optional `postMessage` listener. Set a **Thank-you page URL** in Settings to redirect after submission.

---

## Webhooks (any software)

Add webhooks in the admin or via the API. Every delivery is a `POST` with JSON:

```json
{ "event": "quote.created", "delivery_id": "uuid", "sent_at": "ISO date", "data": { …Quote… } }
```

Events: `quote.created`, `quote.updated`, `quote.status_changed`, `test` (or `*`). Failed deliveries retry after 1s, 5s and 25s. All attempts are visible in **Integrations → Delivery log**. You can add custom headers (e.g. an `Authorization` header your receiver expects).

**Verifying the signature** (when the webhook has a secret):

```js
const crypto = require('crypto');
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-shedbuilder-signature']));
```

### The Quote object
```jsonc
{
  "id": 12, "number": "Q-10012", "status": "new", "created_at": "…",
  "customer": { "first_name", "last_name", "full_name", "email", "phone", "address", "city", "state", "zip", "notes", "sms_consent" },
  "shed": { "style": "Lofted Barn", "size": "12' x 16'", "width_ft": 12, "depth_ft": 16, "sq_ft": 192,
            "colors": { "siding": "Barn Red", "trim": "White", "roof": "Weathered Wood", "door": "Match Trim" } },
  "options": [ { "name": "4' Double Doors", "category": "doors", "wall": "front", "price": 0, "note": "Standard" } ],
  "pricing": { "subtotal", "delivery", "tax", "tax_rate", "total" },
  "summary": "Lofted Barn 12' x 16' | siding: Barn Red, … | Total: $9,450.00",
  "links": { "view_3d", "download_3d_model", "floor_plan_svg", "admin" },
  "config": { /* exact configuration — can be re-loaded into the 3D builder */ }
}
```

---

## REST API

Full interactive reference at **`/docs`**, machine-readable spec at **`/api/openapi.json`** (import into Postman, Make, n8n, etc.).

Create a key in **Admin → Integrations → API keys** and send it as `X-API-Key: sb_live_…` or `Authorization: Bearer sb_live_…`.

| Method & path | Auth | What it does |
|---|---|---|
| `GET /api/v1/catalog` | public | Styles (with sizes), colors, options, display settings |
| `POST /api/v1/price` | public | Price a configuration server-side |
| `POST /api/v1/quotes` | public | Submit a quote (fires webhooks + GHL) |
| `GET /api/v1/quotes?status=&since=&q=&limit=&offset=` | key | List quotes |
| `GET/PATCH/DELETE /api/v1/quotes/{id}` | key | Read, update status/notes, delete |
| `GET /api/v1/quotes/{id}/floorplan.svg` | key | To-scale floor plan |
| `POST /api/v1/quotes/{id}/resend` | key | Re-fire `quote.created` |
| `GET/POST/PATCH/DELETE /api/v1/webhooks[/{id}]` | key | Manage webhook subscriptions (REST hooks) |
| `POST /api/v1/webhooks/{id}/test` | key | Send a test delivery |
| `GET/POST/PATCH/DELETE /api/v1/{styles,sizes,colors,options}[/{id}]` | key | Manage the catalog |

Prices are always recalculated on the server, so a tampered browser can't submit a fake price.

---

## Downloads: 3D model & floor plan
- Customers: **3D model** button (top-right of the viewer, and on the success screen) downloads a `.glb` of their exact shed. **Floor plan** opens a to-scale plan (doors with swings, windows, shelves, loft, lights, outlets, ramp, dimensions, title block) that can be downloaded as SVG or printed / saved as PDF.
- Admin: each quote has *Open in 3D*, *Download 3D model (.glb)* and *Download floor plan*.
- Links in webhooks/GHL: `links.view_3d`, `links.download_3d_model`, `links.floor_plan_svg` (secret, unguessable per-quote token).

`.glb` files open in Windows 3D Viewer, macOS Preview/Reality Composer, Blender, SketchUp (via importer), and most online viewers.

---

## Try-it-now demo

`npm run build:demo` builds `demo/dist/shed-builder-demo.html`: the customer builder as a single file with the sample catalog and no server (quotes aren't sent anywhere). Handy for showing people before you deploy.

## Project layout

```
server.js                    Express app: API, admin, auth, uploads, static files
src/db.js                    SQLite schema + catalog loader
src/auth.js                  Admin sessions, password hashing, API keys
src/integrations.js          Webhooks (signed, retried) + GoHighLevel
src/openapi.js               OpenAPI 3.1 spec
src/seed.js                  First-run sample data
public/index.html            Customer configurator
public/js/configurator.js    Configurator UI logic
public/js/shed3d.js          Three.js engine: procedural shed, option models, picking, GLB export
public/js/shared/*.js        Pricing, geometry & floor plan — shared by browser and server
public/admin/                Admin dashboard
demo/                        Single-file demo build
render.yaml, Dockerfile      Deployment
```

## Notes
- Prices shown are a quote, not a contract — tax and delivery are configurable in Settings; hide prices entirely with *Show prices to customers* off.
- The GoHighLevel native push uses the LeadConnector API v2 (`/contacts/upsert`, `/opportunities/`, `/contacts/{id}/notes`, header `Version: 2021-07-28`). If GHL changes scopes or endpoints, check **Integrations → Delivery log** for the exact response.
