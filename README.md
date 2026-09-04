# Plannercore

## Einheitliches Cores Designsystem

PlannerCore folgt dem verbindlichen Designvertrag aus [`nbt4/cores`](https://github.com/nbt4/cores/blob/main/docs/DESIGN_SYSTEM.md). Die generierten Dateien `web/src/cores-theme.css` und `web/src/lib/cores-design.ts` werden ausschließlich über das Umbrella-Skript synchronisiert und nie direkt editiert.

Die Anwendung besitzt ein fachliches Dashboard mit derselben Begrüßung, KPI-Hierarchie und Shell wie die übrigen Cores. Task-, Label- und Diagrammfarben dürfen Daten semantisch unterscheiden; Typografie, Flächen, Formulare, Tabellen, Dropdowns, Scrollbars, Karten und die 256/80-px-Sidebar bleiben suite-weit identisch.

**Microsoft Planner-Klon als vierter Core-Service — Kanban-Boards, Gantt-Diagramme, Sprint-Planung, Team-Auslastung und mehr. Vollständig integriert ins Cores-Ökosystem.**

Als installierbare PWA bietet PlannerCore auf Smartphone und Tablet eine touchoptimierte App-Shell, Safe-Area-Unterstützung und ein eigenes Homescreen-Icon – sowohl auf der eigenen Domain als auch eingebettet unter `/planner/`.

Produktlogo, Favicon und PWA-Icons werden zentral verwaltet und sowohl auf der
eigenen Domain als auch über den Dashboard-Pfad semantisch ausgeliefert. Die
öffentliche Konfiguration ist unter `/api/v1/branding` beziehungsweise im
eingebetteten Betrieb unter `/api/v1/planner/branding` verfügbar.
Die Desktop-Sidebar lässt sich ein- und ausklappen und verwendet dieselbe
176 × 48-px-Logo- bzw. 40 × 40-px-Symbolfläche wie alle Cores-Services; App-Header
bleiben logofrei und der Browser-Tab verwendet ausschließlich das Produkt-Favicon.

---

## Features

- **Kanban-Board** — Präzises Drag-and-Drop über eigene Griffe und Live-Einfügepositionen; Aufgaben lassen sich innerhalb und zwischen Listen verschieben, die Listen selbst horizontal neu anordnen. Eingeblendete abgeschlossene Aufgaben stehen immer am Ende ihrer Spalte und sind dezent gedimmt. Jede Reihenfolge wird transaktional gespeichert und per WebSocket synchronisiert.
- **Grid View** — Tabellarische Aufgabenübersicht mit Sortierung, Filterung und Mehrfachauswahl
- **Schedule View** — Kalenderansicht (Monat/Woche/Tag) mit react-big-calendar
- **Timeline (Gantt)** — Gantt-Diagramm mit Abhängigkeiten, kritischem Pfad und Drag-and-Drop-Terminierung
- **Charts & Analytics** — Live aus den Planaufgaben berechnete Spalten- und Prioritätsverteilung, Workload-Chart und Burndown-Diagramme mit recharts
- **Sprint-Planung** — Agile Sprint-Verwaltung mit Backlog, Task-Zuweisung und Sprint-Dauer
- **Goals** — OKR-ähnliche Zielverwaltung mit Fortschrittsanzeige
- **People View** — Team-Auslastung und Kapazitätsplanung
- **Bearbeiter-Picker** — Outlook-artige Suche mit großem Anzeigenamen, kleiner E-Mail-Zeile, Profilbild und Tastatursteuerung; Anzeigenamen bleiben nach Reload erhalten
- **Persönliche Ansichten** — „Meine Aufgaben" (aggregiert) und „Mein Tag" (tägliche Fokus-Ansicht); Aufgaben lassen sich direkt abhaken, erhalten den Status „Abgeschlossen“ und werden standardmäßig ausgeblendet. Ein Schalter blendet sie bei Bedarf wieder ein oder öffnet sie erneut.
- **Schnellerfassung** — Neue Aufgaben sind in jeder Planansicht sowie in „Meine Aufgaben“ und „Mein Tag“ anlegbar; Enter speichert und hält das Eingabefeld für die nächste Aufgabe offen. Checklisten unterstützen denselben Ablauf ohne Dialog-Reload.
- **Echtzeit-Kollaboration** — WebSocket-basierte Live-Updates für alle Board-Änderungen
- **Integration Links** — Verknüpfung von Aufgaben mit RentalCore-Jobs und WarehouseCore-Devices
- **Rich-Text Editor** — Tiptap-basierter WYSIWYG-Editor für Aufgabenbeschreibungen mit Checklisten

---

## Tech-Stack

| Schicht       | Technologie                                                |
|---------------|------------------------------------------------------------|
| Backend       | Go 1.25, Gin, GORM, PostgreSQL 16                          |
| Frontend      | React 18, TypeScript, Vite 6, Tailwind CSS 4               |
| State         | React Context / lokaler State                              |
| Kanban        | @dnd-kit (Drag and Drop)                                   |
| Kalender      | react-big-calendar                                         |
| Charts        | recharts                                                   |
| Rich Text     | Tiptap (tiptap/react, starter-kit)                         |
| Real-time     | WebSocket (gorilla/websocket)                              |
| Auth          | Cores-JWT-Session (golang-jwt/jwt/v5)                      |
| Container     | Docker (Multi-Stage: Node 20 + Go 1.25 + Alpine)           |

---

## Schnellstart

### Docker

```bash
docker run -d \
  --name plannercore \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=rentalcore \
  -e DB_USER=rentalcore \
  -e DB_PASS=*** \
  -e CORES_JWT_SECRET=your-2...cret \
  -p 8083:8080 \
  nobentie/plannercore:latest
```

### docker-compose (Auszug)

```yaml
plannercore:
  image: nobentie/plannercore:latest
  ports:
    - "8083:8080"
  environment:
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: rentalcore
    DB_USER: rentalcore
    DB_PASS: ${DB_PASS}
    CORES_JWT_SECRET: ${CORES_JWT_SECRET}
  depends_on:
    - postgres
  volumes:
    - planner_uploads:/app/uploads
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

Frontend Dev-Server: `http://localhost:3003` (proxied API zu Backend `:8080`)

Die produktive SPA unterstützt beide Cores-Betriebsarten: eine eigene Domain
unter `/` sowie den Dashboard-Reverse-Proxy unter `/planner`. Der Router erkennt
den aktiven Pfad automatisch; statische Assets und Logos werden unter beiden
Pfadvarianten ausgeliefert.

---

## API-Endpunkte

### Auth

| Methode | Pfad                       | Beschreibung                             |
|---------|----------------------------|------------------------------------------|
| `POST`  | `/api/v1/auth/login`       | Benutzer-Login                           |
| `POST`  | `/api/v1/auth/logout`      | Session beenden                          |
| `GET`   | `/api/v1/planner/me`       | Aktuellen Benutzer abrufen (🔒)           |
| `GET`   | `/api/v1/planner/users?q=` | Aktive Benutzer inkl. Anzeigename, E-Mail und Avatar suchen (🔒) |

### Pläne

| Methode  | Pfad                                    | Beschreibung                             |
|----------|-----------------------------------------|------------------------------------------|
| `GET`    | `/api/v1/planner/plans`                 | Alle Pläne auflisten (🔒)                |
| `POST`   | `/api/v1/planner/plans`                 | Plan erstellen (🔒)                      |
| `GET`    | `/api/v1/planner/plans/:planId`         | Plandetails (🔒)                         |
| `PUT`    | `/api/v1/planner/plans/:planId`         | Plan aktualisieren (🔒)                  |
| `DELETE` | `/api/v1/planner/plans/:planId`         | Plan löschen (🔒)                        |
| `POST`   | `/api/v1/planner/plans/:planId/copy`    | Plan kopieren (🔒)                       |
| `POST`   | `/api/v1/planner/plans/:planId/favorite`| Favorit umschalten (🔒)                  |

### Tasks

| Methode  | Pfad                                            | Beschreibung                             |
|----------|-------------------------------------------------|------------------------------------------|
| `GET`    | `/api/v1/planner/:planId/tasks`                 | Tasks eines Plans (🔒)                   |
| `POST`   | `/api/v1/planner/:planId/tasks`                 | Task erstellen (🔒)                      |
| `GET`    | `/api/v1/planner/tasks/:taskId`                 | Task-Details (🔒)                        |
| `PUT`    | `/api/v1/planner/tasks/:taskId`                 | Task aktualisieren (🔒)                  |
| `DELETE` | `/api/v1/planner/tasks/:taskId`                 | Task löschen (🔒)                        |
| `PATCH`  | `/api/v1/planner/tasks/:taskId/progress`        | Fortschritt aktualisieren (🔒)           |
| `PUT`    | `/api/v1/planner/:planId/tasks/reorder`         | Tasks innerhalb und zwischen Spalten umsortieren (🔒) |
| `POST`   | `/api/v1/planner/tasks/:taskId/checklist`       | Checklisten-Item hinzufügen (🔒)         |
| `PATCH`  | `/api/v1/planner/checklist/:id`                 | Checklisten-Item aktualisieren (🔒)      |
| `DELETE` | `/api/v1/planner/checklist/:id`                 | Checklisten-Item löschen (🔒)            |
| `POST`   | `/api/v1/planner/tasks/:taskId/assignees`       | Bearbeiter zuweisen (🔒)                 |
| `DELETE` | `/api/v1/planner/tasks/:taskId/assignees/:userId`| Bearbeiter entfernen (🔒)               |
| `GET`    | `/api/v1/planner/tasks/:taskId/comments`        | Kommentare abrufen (🔒)                  |
| `POST`   | `/api/v1/planner/tasks/:taskId/comments`        | Kommentar hinzufügen (🔒)                |
| `POST`   | `/api/v1/planner/tasks/:taskId/attachments`     | Anhang hochladen (🔒)                    |
| `DELETE` | `/api/v1/planner/attachments/:id`               | Anhang löschen (🔒)                      |

### Meine Aufgaben

| Methode  | Pfad                                    | Beschreibung                             |
|----------|-----------------------------------------|------------------------------------------|
| `GET`    | `/api/v1/planner/my/tasks`              | Meine offenen Tasks; `includeCompleted=true` schließt abgeschlossene ein (🔒) |
| `GET`    | `/api/v1/planner/my/day`                | Mein-Tag-Ansicht (🔒)                    |
| `POST`   | `/api/v1/planner/my/day/:taskId`        | Zu „Mein Tag" hinzufügen (🔒)            |
| `DELETE` | `/api/v1/planner/my/day/:taskId`        | Von „Mein Tag" entfernen (🔒)            |

### Buckets, Sprints, Goals, Timeline

| Methode  | Pfad                                              | Beschreibung                             |
|----------|---------------------------------------------------|------------------------------------------|
| `GET`    | `/api/v1/planner/:planId/buckets`                 | Buckets auflisten (🔒)                   |
| `POST`   | `/api/v1/planner/:planId/buckets`                 | Bucket erstellen (🔒)                    |
| `PUT`    | `/api/v1/planner/:planId/buckets/reorder`         | Vollständige Bucket-Reihenfolge speichern (🔒) |
| `PUT`    | `/api/v1/planner/:planId/buckets/:id`             | Bucket aktualisieren (🔒)                |
| `DELETE` | `/api/v1/planner/:planId/buckets/:id`             | Bucket löschen (🔒)                      |
| `GET`    | `/api/v1/planner/:planId/sprints`                 | Sprints auflisten (🔒)                   |
| `POST`   | `/api/v1/planner/:planId/sprints`                 | Sprint erstellen (🔒)                    |
| `PUT`    | `/api/v1/planner/:planId/sprints/:id`             | Sprint aktualisieren (🔒)                |
| `DELETE` | `/api/v1/planner/:planId/sprints/:id`             | Sprint löschen (🔒)                      |
| `POST`   | `/api/v1/planner/:planId/sprints/:id/tasks`       | Tasks zu Sprint hinzufügen (🔒)          |
| `GET`    | `/api/v1/planner/:planId/goals`                   | Goals auflisten (🔒)                     |
| `POST`   | `/api/v1/planner/:planId/goals`                   | Goal erstellen (🔒)                      |
| `PUT`    | `/api/v1/planner/:planId/goals/:id`               | Goal aktualisieren (🔒)                  |
| `DELETE` | `/api/v1/planner/:planId/goals/:id`               | Goal löschen (🔒)                        |
| `GET`    | `/api/v1/planner/:planId/timeline`                | Timeline/Gantt (🔒)                      |
| `POST`   | `/api/v1/planner/:planId/dependencies`            | Abhängigkeit hinzufügen (🔒)             |
| `DELETE` | `/api/v1/planner/:planId/dependencies/:id`        | Abhängigkeit löschen (🔒)                |

### Labels, Integration, Analytics

| Methode  | Pfad                                              | Beschreibung                             |
|----------|---------------------------------------------------|------------------------------------------|
| `GET`    | `/api/v1/planner/:planId/labels`                  | Labels auflisten (🔒)                    |
| `POST`   | `/api/v1/planner/:planId/labels`                  | Label erstellen (🔒)                     |
| `DELETE` | `/api/v1/planner/:planId/labels/:id`              | Label löschen (🔒)                       |
| `GET`    | `/api/v1/planner/:planId/links`                   | Integration-Links abrufen (🔒)           |
| `POST`   | `/api/v1/planner/:planId/links`                   | Integration-Link erstellen (🔒)          |
| `DELETE` | `/api/v1/planner/:planId/links/:id`               | Integration-Link löschen (🔒)            |
| `GET`    | `/api/v1/planner/:planId/analytics/tasks`         | Task-Chart (Status) (🔒)                 |
| `GET`    | `/api/v1/planner/:planId/analytics/workload`      | Workload-Chart (🔒)                      |
| `GET`    | `/api/v1/planner/:planId/analytics/burndown`      | Burndown-Chart (🔒)                      |
| `GET`    | `/api/v1/planner/ws`                              | WebSocket (Echtzeit-Updates)             |
| `GET`    | `/health`                                         | Health Check (öffentlich)                 |

🔒 = Authentifizierung via `session_id` Cookie erforderlich

---

## Umgebungsvariablen

| Variable            | Beschreibung                                       | Standard               |
|---------------------|----------------------------------------------------|------------------------|
| `PORT`              | Server-Port                                        | `8080`                 |
| `DB_HOST`           | PostgreSQL-Host                                    | –                      |
| `DB_PORT`           | PostgreSQL-Port                                    | `5432`                 |
| `DB_NAME`           | Datenbank-Name (Shared mit RentalCore)             | `rentalcore`           |
| `DB_USER`           | Datenbank-Benutzer                                 | –                      |
| `DB_PASS`           | Datenbank-Passwort                                 | –                      |
| `CORES_JWT_SECRET`  | JWT-Secret (Cores-weit identisch)                  | –                      |

---

## Verzeichnisstruktur

```text
plannercore/
├── cmd/server/main.go        # Entrypoint, Routing, Middleware
├── internal/
│   ├── auth/                 # Session-Validierung via Cores-JWT
│   ├── plans/                # Plan-Service (CRUD, Copy, Favoriten)
│   ├── tasks/                # Task-Service (CRUD, Checklisten, Kommentare, Anhänge)
│   ├── boards/               # Board/Bucket-Service
│   ├── timeline/             # Gantt & Abhängigkeiten
│   ├── sprints/              # Sprint-Management
│   ├── goals/                # Zielverwaltung
│   ├── analytics/            # Charts & Reporting
│   ├── websocket/            # Echtzeit-Kommunikation
│   ├── labels/               # Label-Verwaltung
│   └── integration/          # Cores-Verknüpfungen
├── web/                      # React Frontend (SPA)
├── migrations/               # DB-Schema
├── Dockerfile
└── README.md
```

---

## Login

Plannercore teilt die User-Datenbank mit dem Cores-Dashboard, RentalCore und WarehouseCore. Lokale und aus Microsoft Entra synchronisierte Benutzer stehen gleichermaßen als Bearbeiter zur Verfügung. Der Picker und alle Task-Antworten verwenden den zentralen Profil-Anzeigenamen statt Benutzername oder numerischer ID. Bei fehlender Sitzung öffnet Plannercore ausschließlich den zentralen Cores-Login und kehrt nach lokaler oder Microsoft-Anmeldung zur vorherigen Planner-Ansicht zurück. Die Sitzung wird über den gemeinsamen Cores-JWT-Cookie übernommen.

Default-Credentials: `admin` / `admin` (Passwortänderung beim ersten Login erzwungen)

---

[Quellcode](https://github.com/nbt4/plannercore) | [Monorepo](https://github.com/nbt4/cores) | `nobentie/plannercore:latest`
