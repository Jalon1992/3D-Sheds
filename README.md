# 3D Shed Builder

A self-hosted 3D shed configurator with an admin back office, an Open REST API, signed webhooks and a native GoHighLevel integration.

- **Customers:** pick a Style & Size (one screen) → Roof & Colors (Architectural Shingles or Ag Panel Metal) → Options → submit a Quote. Standard options are already on the shed. Customers **drag and drop** doors, windows and every other option to a new spot on the 3D model (along a wall, around a corner to another wall, across the ceiling), and click any of them to upgrade, swap or remove it. After submitting they can download their **3D model (.glb)** and a **to-scale floor plan** (SVG / print to PDF).
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
| `COOKIE_SECURE` | auto | Session cookie gets `Secure` automatically over HTTPS; force with `true`/`false` |
| `PUBLIC_URL` | — | Base URL for links in webhooks/GHL (same as **Settings → Public URL**; on Railway `RAILWAY_PUBLIC_DOMAIN` is used automatically) |
| `TRUST_PROXY` | `1` | How many proxy hops to trust for the client IP (rate limits). `1` is right for Railway/Render/Fly or one Nginx |
| `ALLOW_PRIVATE_WEBHOOKS` | `false` | Allow webhooks to private/LAN addresses (blocked by default so the server can't be used to probe its own network) |

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
  -e ADMIN_EMAIL=you@co.com -e ADMIN_PASSWORD='…' -e PUBLIC_URL=https://builder.yourdomain.com shed-builder
```

**Render / Railway / Fly.io:** create a Node (or Docker) web service from this folder, add a persistent volume mounted at `/app/data` (and one for `/app/uploads`, or set `UPLOAD_DIR` inside the same volume, e.g. `/app/data/uploads`), set the env vars above, start command `npm start`.

**VPS:** `npm install --omit=dev && npm start` behind Nginx/Caddy with HTTPS, kept alive with pm2 or systemd.

After deploying, set **Admin → Settings → Public URL** (e.g. `https://builder.yourdomain.com`) so links in webhooks and GHL point to the right place.

---

## Managing the catalog

### Styles & sizes
Each style sets the **roof** (gable, barn/gambrel, lean-to, saltbox), which side faces front (gable end or long eave side), wall height, **roof pitch** (gambrel: separate **lower and upper pitch** and the **lower section length in feet** along the slope; saltbox: **long- and short-slope pitches**; the editor shows each section's pitch and length live), **eave overhang** and **gable overhang** (set separately), **siding** (LP SmartSide panel with 8" o.c. grooves and a painted, lightly embossed finish — the default — plus lap, board & batten, smooth T1-11 or metal), **wood trim** (LP SmartSide cedar-texture trim or smooth; metal trim is always smooth), the standard roofing and the roofing choices, a **roof edge style** (wide metal rake trim in the roof color, or a trim-color rake board + fascia capped with a thin metal rake edge and drip edge — sizes and metal color adjustable), and **trim sizes in inches**: fascia height (trim color), shingle rake board height (trim color), metal rake trim height and leg (roof color), corner board width, door & window trim width. The editor shows a live 3D preview.

- **Sizes:** width × depth with a base price each. Use *Fill prices* to set every size from a $/sq ft + base amount, then tweak.
- **Standard options:** items already on the shed and included in the base price (e.g. a 36" door on the front). Pick the option, the wall and an offset in feet from the wall's centre (viewed from outside, + is right). Optional **width/height** columns resize a door or window for just that style; leave them blank to use the option's own size. Customers who swap a standard item pay only the difference.
- **Options offered on this style:** untick anything the style shouldn't offer (e.g. no lofts on the garage). Customers only see the ticked options, switching styles drops items the new style doesn't offer, and the server enforces it on every quote. The style's standard options are always included.
- **Default colors** per style.

**Phones, tablets & computers:** the builder adapts to the screen. On computers the 3D view sits beside the panel. On phones and tablets held upright, the 3D view stays pinned at the top while the customer scrolls the options. On phones held sideways, the 3D view and the panel sit side by side. Touch screens get bigger buttons, plus tap to select, press-and-drag to move and pinch to zoom. Form fields stay at 16px so iPhones don't zoom in. The admin works on phones and tablets too: the menu scrolls across the top, wide tables scroll sideways, and editors open full-screen.

**Roof trim rules:** shingle roofs get no metal trim at all: shingle ridge caps, shingles lapping over the gambrel break, and a trim-color rake board (no metal rake edge or drip edge). Metal roofs are modelled as real **Ag Panel** (3/4" trapezoid ribs every 9" with two stiffening ribs between, screw rows every 2 ft, painted-steel finish). They keep the metal ridge cap, transition trim and rake trim. The ridge cap goes on last: it sits on top of the rake trim and runs out over its ends.

**Fly rafter (rake) tail cut — per style:** *Flat* cuts the rake tails level with the bottom of the fascia, so no point hangs below it (best on the steep hips of a Lofted Barn). *Plumb* is a vertical cut in line with the fascia face. Leave it on *Default* for flat on barns and plumb on everything else. The elevation drawings follow the same setting.

**Lofted Barn hip lengths:** set the **hip (lower section) length** and, optionally, the **upper section length** (both measured along the slope, without overhang). With only the hip length set, the upper pitch decides the upper section. With both set, the upper pitch is worked out to match. Both can be overridden **per size** in the size table (*Hip len / Upper len* columns). The roof readout shows each section's actual pitch and length for the previewed size.

### Roofing (Architectural Shingles / Ag Panel Metal)
Admin → **Roofing & colors → Roofing materials**: rename, describe and price each roofing type: per sq ft of **roof surface** (calculated from pitch and overhangs), per sq ft of floor, or flat. On each style choose the **standard roofing** (included in the base price) and which roofing types customers can pick; picking a different one charges the difference. Each roof color can be limited to shingles or metal (e.g. Galvalume only shows for Ag Panel).

### Colors
Siding, trim, roof, door and **window** colors (window color = the window frame and grids; the trim around windows always matches the trim color), each with an optional upcharge. A door or window color named **“Match Trim”** automatically follows the trim color. Each color group has a **“Customers can choose”** switch; turn it off and customers no longer see that choice (the style's default color is used, and the server enforces it).

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

**Door & window sizes:** each option's width × height is set in its editor with a live preview; per-style sizes can be overridden in the style's standard options.

**Standard window heights:** Options → Windows has a *Standard window heights* table. For each window type, enter the bottom or the top in inches above the floor (the other follows). The option editor shows the same as *Standard height*, with the top and head-trim heights worked out for you.

**Customer window heights:** Settings → *Let customers raise or lower windows*. When on, clicking a window on the model shows ▲/▼ buttons that move it in 2" steps, from 12" off the floor up to the roof line, never overlapping anything. *standard* puts it back. The chosen height shows on the quote, the PDF and in GHL/webhooks ("bottom 36\" off floor"). When off, windows stay at each window type's standard height, and the server ignores heights sent by anyone.

**Top & bottom window grids:** in a window's editor, set *Top half grid* and *Bottom half grid* (e.g. 2 × 2 over 2 × 2, or 3 × 2 over none). The window gets two sashes with a meeting rail, each with its own grid, in 3D and on the drawings. Leave both on *Standard grid* for the regular one-piece grid.

**Customer-picked lengths (double shelves, workbenches…):** fill in *Lengths customers can pick* (e.g. `4, 6, 8, 10, 12`) and set *Priced* to *Per ft of its length*. Customers get length buttons on the model (lengths longer than the wall are greyed out; a no-room pop-up appears if the length doesn't fit). The sample **Double Shelves (20" deep)** are two shelf levels at $24/ft.

**Door styles:** built-in models include the **72" carriage-house double doors** and **36" single carriage-house door** (5-lite windows, raised panels, black T-hinges at the top, middle and bottom rails), plus **panel double doors** and a **36" panel door** — the same look without the windows (the single is the right half of the double: hinges on the right, knob on the left). All take the customer's door color; window grids take the trim color.

**Gable windows:** each window/vent has *Can it go up in the gable?*: **No** (walls only), **Yes** (the customer gets *On the wall / Up in the gable* buttons when it's on a gable end) or **Gable only**. Up in the gable, the window is centred between the top of the wall and the rake. If it's too tall for that gable, the customer is told so and it stays put. Standard options have an *In gable* tick too. A sample *Gable Window (24" × 16")* is included.

**No overlaps:** doors, windows and everything else on a wall can't overlap, **trim included**: door/window casings, sills and shutters are counted, and openings stay clear of the corner boards. Dragging stops at the last free spot. When something can't fit (adding it, swapping to something bigger, moving it to another wall, putting it in the gable, or a size change that leaves no room), the customer gets a **pop-up saying there's no room** and what to try. The server applies the same rules to every quote and price request, including ones sent through the API.

**Swap group:** options with the same swap group (e.g. `door`, `window`) appear as upgrade choices when the customer clicks that item on the model.

**3D models — uploading & updating:** Admin → **Options & 3D models**. Every option with a 3D model has **Upload .glb / Replace .glb** and **Download** buttons right in the list, plus a *3D model* section at the top of its editor. To change a model:
1. Click **Download** to get the current model (the built-in one, or your last upload) as a `.glb` starting file.
2. Edit it in Blender, SketchUp or similar. Front facing **+Z**, **Y** up, sitting on the ground.
3. Click **Upload .glb** (or drag the file onto the upload box in the editor). It replaces the model everywhere right away, including in customers' 3D views, downloads and PDFs. Upload a new file any time to update it. *Use built-in instead* switches back.

Models are stretched to the width × height × depth you enter, so match those to the real product. Built-in models (single/glass/double/French/roll-up doors, windows, shutters, transoms, vents, flower box, lights, outlets, switch, breaker box, shelf, workbench, loft, ramp, cupola) take the customer's door/trim colors automatically.

**Packages (e.g. the Electrical Package):** any option can be a package. In its editor, under *What's in this package*, add items (breaker box, outlets, switches, lights, exterior lights…) with a **quantity**, the **wall** it goes on (front/back/left/right, ceiling, or auto), a **position** in feet from the wall centre (seen from outside, + = right; blank = we pick a free spot) and an optional **height**. When a customer adds the package, every item is placed on their shed at those spots, shown as *Included in the Electrical Package*, and priced in the package. If a spot is taken or the shed is too small, the item goes to the nearest free spot, and the customer is told if something doesn't fit at all. Customers can move package items but can't remove them on their own; removing the package removes them all. Tick *Only sold as part of a package* for parts like the breaker box so they aren't listed on their own. A package can also be a style's standard option. The floor plan shows electrical symbols (outlets, switches, ceiling lights, breaker panel) with a legend.


---

## Showing prices: customer vs dealer configurator

- **Customer-facing configurator** (your public link / website embed): Admin → Settings → **Show prices to customers**. When it's off, customers see no prices anywhere: no totals, no option prices, "Price on request" in the footer, and a *design* PDF without prices. Prices aren't even sent to their browser (the public catalog comes back with prices zeroed and the public price API refuses), so nobody can dig them out. Quotes are still priced on the server and sent to you, your webhooks and GHL with full pricing.
- **Dealer-facing configurator**: open the configurator while signed in to the admin (**Open configurator (dealer mode)**). It **always shows prices**, whatever the setting, and has a *Dealer mode* badge with a **Customer view** switch to preview exactly what customers see. Any staff login works (admin, sales, production). Sales/production users tied to a dealer lot are locked to that lot and its price tier. Quotes made this way are marked *Dealer configurator — name*, so you can tell them apart in Quotes.
- Give lot staff their own login (Account & users → role *Sales*, pick their lot) and have them sign in on the lot's tablet. The configurator then works as their dealer tool.

## Price tiers, dealer lots & ZIP pricing

Admin → **Price tiers & dealers**.

- **Pricing mode:** *Same price everywhere*, *By dealer lot*, or *By ZIP code*. Switch any time.
- **Four tiers.** Each tier has a name, an **adjust all prices %** (e.g. +8%), an optional **delivery fee**, and an optional **price sheet**:
  1. Click **Download price sheet** on a tier. It's a CSV listing every size, option, upcharged color and roofing type with its standard price.
  2. Fill in the last column with that tier's price (leave blank to use the % adjustment). Don't change the ID column.
  3. **Upload price sheet**, then **Save changes**.
- **Dealer lots:** add each lot (name, address, contact) and pick its tier. Customers choose their lot at the top of the builder. The copy button gives each lot its own builder link (`…/#dealer-lot1` or `?dealer=lot1`) that locks in that lot's pricing — use it on each lot's page or in GHL funnels.
- **ZIP codes:** assign tiers to exact ZIPs (`38301`), ranges (`38300-38399`) or prefixes (`383`). Add them one by one, paste a list (`ZIP,tier`), or upload a CSV. Exact beats range, range beats prefix; unlisted ZIPs use the **default tier**. Customers enter their ZIP at the top of the builder (or in the quote form).
- Prices are always recalculated on the server for the chosen lot/ZIP. Each quote stores the **dealer lot** and **price tier**; both appear in the admin, CSV export, webhooks (`dealer`, `pricing.tier`) and GoHighLevel (a `dealer: Lot name` tag, the note, and flat fields `dealer_name` / `price_tier`). The quotes API can filter by `?dealer=lot1`.

## Team roles & drawing packages

Admin → **Account & users** → add team members with a role:

| Role | Can do |
|---|---|
| **Admin** | Everything |
| **Sales** | View quotes, change status & notes, download drawings |
| **Production** | View quotes (read-only) and download drawings |

Sales and Production users can be limited to **one dealer lot** — they then only see that lot's quotes (enforced by the server).

**Drawings (PDF)** — on any quote (list or detail) click **Drawings PDF** to get one file with:
1. 3D view & specifications (size, roofing, colors, dealer lot, delivery address, every option and its wall)
2. Floor plan (to scale)
3. Front & back elevations
4. Left & right elevations

Elevations are drawn to scale from the same geometry as the 3D model: siding, trim, roof profile and overhangs, every door/window/vent with its size, wall height and overall height.

**Quote PDF (prices + drawings)** — Admin and Sales also get a **Quote PDF** button. It is the same package with a **Quote & pricing** sheet added as sheet 2: customer contact, dealer lot, price tier, every line item (base shed, roofing, upgrades with "Upgrade from …", standard items marked *Included*, credits for removed standard items), subtotal, delivery, tax and total. The cover sheet also shows the total. Production only sees the Drawings PDF, which has no prices.

Customers can download their own Quote PDF from the thank-you screen after submitting. It does not show the tier name. You can turn this off in **Settings** ("Let customers download their quote PDF"), and the **Terms printed on the quote PDF** setting controls the fine print.

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

`npm run build:demo` builds a static demo in `demo/dist/`: the 3D builder (`shed-builder-demo.html`) and the admin (`admin.html`). They share an in-browser stand-in for the server, so admin changes show up in the builder and submitted quotes appear in the admin. Data stays in that browser; webhooks and GoHighLevel only run on the real server. Serve both files from the same folder (with the builder as `index.html`). `node demo/build.mjs --seed http://localhost:3000` refreshes the sample catalog from a running server.

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

## Updating an existing install

Pushing a new version keeps your catalog, prices and quotes. The first start after an update also brings an older
catalog up to date once: the stock **6' Double Doors** switch to the plain panel look (no X braces), and the
**36" Standard Door** (right half of the 6' double), **36" Carriage House Door** (right half of the 72"),
**72" Carriage House Double Doors** and **Double Shelves** are added if they're missing. Options you renamed or
rebuilt are left alone. The browser demo does the same for a browser that opened an older demo.

## Security

- **Logins:** scrypt-hashed passwords; HttpOnly + SameSite session cookies (Secure over HTTPS). Changing a password, or deleting a user, signs that login out everywhere. Login is rate-limited per IP (10/min) and per account (20 failures locks it for 15 min). The dashboard warns while the default `changeme123` password is still in use.
- **Roles:** sales/production logins and lot-restricted users are enforced on the server (a lot user can't see, change or download another lot's quotes). API keys are stored hashed and can't reach users, settings or API-key management.
- **Webhooks:** only to public internet addresses — localhost, private ranges and cloud metadata IPs are refused (checked again at send time, redirects aren't followed). Set `ALLOW_PRIVATE_WEBHOOKS=true` to deliver inside your own network.
- **Uploads:** only .glb/.gltf/png/jpg/webp/svg; served with a sandbox policy so a script inside an uploaded SVG can't run.
- **Other:** all SQL is parameterized; customer text is escaped everywhere it's shown (admin, floor plans, PDFs) and CSV exports are protected against spreadsheet-formula injection; the admin can't be framed (clickjacking) while the customer builder stays embeddable for GHL; request bodies are size-limited; errors don't leak internals.
- `npm audit`: 0 known vulnerabilities at the time of release.

## Notes
- Prices shown are a quote, not a contract — tax and delivery are configurable in Settings; hide prices entirely with *Show prices to customers* off.
- The GoHighLevel native push uses the LeadConnector API v2 (`/contacts/upsert`, `/opportunities/`, `/contacts/{id}/notes`, header `Version: 2021-07-28`). If GHL changes scopes or endpoints, check **Integrations → Delivery log** for the exact response.
