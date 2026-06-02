# Plannercore

Microsoft Planner-Klon als Teil des Tsunami Events Cores-Ökosystems.

## 📋 Übersicht

Plannercore ist der vierte Core-Service und bildet die vollständige Funktionalität von Microsoft Planner ab — von Kanban-Boards über Gantt-Diagramme bis hin zu Sprint-Planung und Team-Auslastung.

## Module

### Basic
- **Task Board** — Kanban mit Drag & Drop, Buckets, Labels
- **Grid View** — Tabellarische Aufgabenübersicht mit Sortierung/Filterung
- **Schedule View** — Kalenderansicht (Monat/Woche/Tag)
- **Charts View** — Analytics & Reporting (Status, Workload, Burndown)

### Premium
- **Timeline View** — Gantt-Diagramm mit Abhängigkeiten und kritischem Pfad
- **People View** — Team-Auslastung und Kapazitätsplanung
- **Goals** — Zielverwaltung (OKR-ähnlich)
- **Sprints** — Agile Sprint-Planung

### Persönlich
- **Meine Aufgaben** — Aggregierte Ansicht aller zugewiesenen Tasks
- **Mein Tag** — Tägliche Fokus-Ansicht

## Tech Stack

- Backend: Go 1.24, Gin, GORM, PostgreSQL 16
- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Real-time: WebSocket (gorilla/websocket)
- Kanban: @dnd-kit
- Kalender: react-big-calendar
- Charts: recharts

## 🚀 Quick Start

### Docker

```bash
docker run -d \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=rentalcore \
  -e DB_USER=rentalcore \
  -e DB_PASS=yourpassword \
  -p 8083:8080 \
  nobentie/plannercore:latest
```

### docker-compose

```yaml
plannercore:
  image: nobentie/plannercore:latest
  environment:
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: rentalcore
    DB_USER: rentalcore
    DB_PASS: ${DB_PASS}
  ports:
    - "8083:8080"
  depends_on:
    - postgres
```

### Entwicklung

```bash
# Backend
cd plannercore
go mod tidy
go run cmd/server/main.go

# Frontend (separates Terminal)
cd plannercore/web
npm install
npm run dev
```

Frontend: `http://localhost:3003` (proxied API zu Backend `:8080`)

## 🔐 Login

Plannercore teilt die User-Datenbank mit RentalCore/WarehouseCore. Login erfolgt über den bestehenden `session_id` Cookie.

Default-Credentials: `admin` / `admin` (Passwortänderung beim ersten Login erzwungen)

## 📁 Verzeichnisstruktur

```
plannercore/
├── cmd/server/main.go       # Entrypoint & Routing
├── internal/
│   ├── core/                # Domain-Modelle & Events
│   ├── auth/                # Session-Validation
│   ├── plans/               # Plan-Service
│   ├── tasks/               # Task-Service
│   ├── boards/              # Board/Bucket-Service
│   ├── timeline/            # Gantt & Abhängigkeiten
│   ├── sprints/             # Sprint-Management
│   ├── analytics/           # Charts & Reporting
│   ├── websocket/           # Echtzeit-Kommunikation
│   └── integration/         # Cores-Verknüpfungen
├── web/                     # React Frontend
├── migrations/              # DB-Schema
├── Dockerfile
└── README.md
```

## Deployment

Docker Image: `nobentie/plannercore`
Version Tags: `1.X` + `latest`
Stack: `/opt/docker/komodo/stacks/tscores/docker-compose.yml`
Port: `8083`

## Version History

- **1.0** — Initial release: Full Microsoft Planner clone (Basic + Premium)
