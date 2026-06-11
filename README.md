# CableClue

A web UI to administer racks with network switches and patch panels. Build racks
visually by dragging switch/patch/blind-panel formats from a library into rack
slots, name and configure each device, and assign VLANs, IPs and clients to
individual ports.

Part of the *Clue* family — ships as a single Docker container.

## Features (v0.3)

- **Tabs = racks.** Each tab is one rack; add, rename (double-click the tab) and
  delete racks.
- **Library sidebar (collapsible).** Drag templates into a rack:
  - Switches: 8p, 24p, 48p
  - Patch panels: 24p (1U), 48p (2U)
  - Blind panels: 1U, 2U
- **Graphical faceplates.** Switches and patch panels render as realistic
  faceplates with SVG RJ45 jacks, status LEDs and per-port link LEDs. Hover a
  port for a VLAN/IP/client tooltip.
- **Right-hand inspector panel.** Click a device, port or cable to edit it in the
  persistent inspector on the right (no pop-ups).
- **Manufacturer / model library.** Pick from common Netgear, Cisco, Aruba,
  Yamaha, UniFi (Pro), Luminex (+ MikroTik, Extreme, TP-Link Omada) models, or
  type a custom model.
- **VLANs per rack** (tag, name, color); ports are tinted by their VLAN.
- **Port links.** Toggle *Link mode* and click any two ports to connect them;
  links are colored bezier lines routed on the right of the rack. Click a link to
  recolor, label or delete it.
- **Light / dark theme** with a sun/moon toggle (persisted), plus version and a
  GitHub link in the header — styled to match CargoClue.

Data is stored in SQLite on a persistent volume.

## Run with Docker (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:8080>. The database persists in the `cableclue-data`
volume.

## Local development

Two processes — the Express API and the Vite dev server (which proxies `/api`):

```bash
# 1. backend (port 8080)
npm install
npm run dev

# 2. frontend (port 5173, in a second terminal)
npm --prefix client install
npm run client:dev
```

Open <http://localhost:5173>. The SQLite file lives in `./data/cableclue.db`.

## Configuration

| Variable   | Default        | Description                          |
| ---------- | -------------- | ------------------------------------ |
| `PORT`     | `8080`         | Port the server listens on.          |
| `DATA_DIR` | `./data` (`/data` in Docker) | Directory for the SQLite database. |

## Architecture

- **Frontend:** React + Vite + TypeScript, `@dnd-kit` for drag & drop.
- **Backend:** Express + `better-sqlite3` (`server.js`, `db.js`).
- **Docker:** multi-stage build — Vite output is served as static files by the
  same Express process that serves the `/api` routes.
