# AGENTS.md — plannercore

Hausregeln für KI-Agenten in diesem Repository. Vor der ersten Änderung vollständig
lesen. Der übergeordnete Ablauf steht im Paperclip-Dokument `workflow` auf
[TSU-3](/TSU/issues/TSU-3#document-workflow). Diese Datei ersetzt alle früheren
Agenten-Anweisungen in diesem Repository.

## 1. Was dieses Repository ist

- **Zweck:** Planung: Pläne, Aufgaben, Sprints, Ziele, Boards, Zeitleiste, Auswertungen, Abhängigkeiten, Arbeitslast. Live-Aktualisierung über WebSocket. Intern Port 8080, nach außen 8083. Abbild `nobentie/plannercore`.
- **Sprache und Laufzeit:** Go 1.25 (Modul `plannercore`) + React/TypeScript
- **Rahmenwerk:** `gin` + `gin-contrib/cors`, `gorilla/websocket`, GORM + `driver/postgres`, `google/uuid`, `prometheus`. Frontend: das aufwendigste der Suite — `@dnd-kit`, `@tiptap`, `react-big-calendar`, `recharts`, `date-fns`, `dompurify`
- **Datenbank:** PostgreSQL 16, gemeinsame Suite-Datenbank. Suite-Migration `036_planner_initial_schema.sql` erzeugt 20 Tabellen; eigene Spur nur `migrations/postgresql/003`, `004`
- **Architektur-Doku:** [Cores — Architektur (Phase 1)](/TSU/issues/TSU-4#document-architecture)

## 2. Aufbau

| Pfad | Inhalt |
|---|---|
| `cmd/server/main.go` | Einstiegspunkt (15 KB) |
| `internal/plans`, `internal/tasks`, `internal/sprints`, `internal/goals`, `internal/boards`, `internal/timeline` | Fachbereiche |
| `internal/analytics`, `internal/labels` | Auswertung und Etiketten |
| `internal/auth`, `internal/core`, `internal/integration`, `internal/metrics` | Querschnitt |
| `internal/websocket` | Live-Updates |
| `web/` | React-SPA |
| `migrations/postgresql/` | `003_plannercore_schema.sql`, `004_task_recurrence.sql` |

Erzeugte Dateien, die **niemals von Hand** geändert werden:

- `web/src/cores-theme.css` — erzeugt durch `cores/scripts/sync-design-system.sh`
- `web/src/lib/cores-design.ts` — dito
- `web/src/lib/SuiteLanguageSwitcher.tsx` — dito
- `web/src/lib/cores-locales/` — dito
- `web/package-lock.json` — nur als Nebenwirkung eines freigegebenen Updates

## 3. Einrichten

```bash
go mod download
cd web && npm ci && npm run build && cd ..
# Datenbank: aus dem Dachrepository `cores` starten
#   cd ../cores && docker compose up -d postgres
```

Dieses Repository hat **keine eigene `.env.example`**. Verbindliche Quelle ist `cores/.env.example`. Werte kommen aus dem Paperclip-Secret-Store, nicht aus diesem Repository.

**`CGO_ENABLED=1`** — lokale Builds brauchen `gcc`/`musl-dev`.

## 4. Test- und Build-Befehle

Diese Befehle sind das Test-Gate. **Alle müssen grün sein, bevor ein Pull Request
entsteht.**

**Die Reihenfolge ist bindend, nicht nur empfohlen. Die Stufen laufen nacheinander, nie
parallel.** Die schnellen Prüfungen stehen zuerst. Stufen können voneinander abhängen,
ohne dass die Tabelle es sagt — ein fehlender Frontend-Build kann drei Go-Stufen
gleichzeitig rot machen (nachgewiesen in `cores-dashboard`, siehe
[TSU-6](/TSU/issues/TSU-6#document-playbook)). Nach dem ersten echten Fehler wird
angehalten.

| # | Gate | Befehl | Dauer (ca.) |
|---|---|---|---|
| 1 | Format | `gofmt -l .` (leere Ausgabe = grün) | < 10 s |
| 2 | Frontend-Build und Typen | `cd web && npm run build` (`tsc -b && vite build`) | 1–2 min |
| 3 | Go-Build | `go build -o server cmd/server/main.go` | ~30 s |
| 4 | Unit-Tests | `go test ./...` | < 1 min |
| 5 | Vet | `go vet ./...` | ~30 s |

Einzelne Datei testen: `go test ./internal/tasks -run TestName -v`

**Dies ist das schwächste Glied der Suite bei Tests: zwei Go-Testdateien bei vierzehn Fachbereichen, und im Frontend weder ein `lint`- noch ein `test`-Skript.**

Daraus folgt eine Sperre, die der Nutzer gesetzt hat: **bis die Testabdeckung aufgebaut ist (eigene Paperclip-Aufgabe), ändert kein Agent hier etwas Fachliches.** Erlaubt sind in dieser Zeit nur Tests, Dokumentation und das Nachziehen erzeugter Theme-Dateien. Eine fachliche Aufgabe für dieses Repository wird zurückgegeben, nicht ausgeführt.

Regeln:

- **Neuer Code braucht neue Tests.** Ein Bugfix braucht einen Test, der ohne den Fix
  fehlschlägt.
- **Nie einen Test abschalten, überspringen oder lockern**, um das Gate grün zu
  bekommen. Ein roter Test ohne Bezug zur Änderung wird gemeldet, nicht entfernt.
- **Tests laufen gegen die lokale oder die Test-Datenbank. Nie gegen Produktion.**
  Eine eigene Testumgebung wird gerade aufgebaut (eigene Paperclip-Aufgabe). Bis sie
  steht: nur lokale Container mit eigenem Volume.
- Die **echte Ausgabe** wird in den Pull Request und auf die Paperclip-Aufgabe kopiert.
- **Ein Testlauf aus dem Cache ist kein Nachweis.** Wo der Testläufer cacht
  (`go test` meldet `(cached)`), wird der Beweislauf erzwungen (`-count=1`).

### Bekannt rote Stufen

Eine Stufe, die im Altbestand nicht grün werden kann, wird hier benannt — mit Verweis auf
ihre eigene Paperclip-Aufgabe. Sie ist die **einzige** erlaubte Ausnahme und deckt keine
andere Stufe. Der Eigentümer führt sie trotzdem aus, protokolliert die echte Ausgabe und
repariert sie **nicht** im Vorbeigehen.

| Stufe | Grund | Aufgabe |
|---|---|---|
| — | keine Ausnahme | — |

Ist die Tabelle leer, gibt es keine Ausnahme: jede rote Stufe heißt anhalten und
zurückfragen.

## 5. Code-Stil

- Format und Lint werden durch die Werkzeuge in Abschnitt 4 erzwungen. Kein Streit
  über Formatierung — der Formatierer entscheidet.
- **Dem umgebenden Code folgen.** Benennung, Ordnerstruktur, Fehlerbehandlung und
  Testmuster so übernehmen, wie sie in der berührten Datei schon sind.
- Benennung: PascalCase für Go-Exporte, camelCase für Lokales; React-Komponenten
  PascalCase, Hooks `useXxx`.
- `gin` ist der Router hier. Fehler am Rand in eine HTTP-Antwort übersetzen, keine
  `panic` im Anfragepfad.
- Fachbereiche unter `internal/` bleiben getrennt. Keine neue Kopplung zwischen
  `plans`, `tasks`, `sprints`, `goals`, `boards`, `timeline`.
- WebSocket-Nachrichten sind ein Vertrag mit dem Frontend. Format nicht stillschweigend
  ändern.
- Nutzereingaben, die als HTML gerendert werden (`@tiptap`), gehen durch `dompurify`.
  Diesen Schritt nicht entfernen.
- Planner-eigene Aufgaben-, Etiketten- und Diagrammfarben dürfen Daten transportieren.
  Shell, Typografie, Formulare, Tabellen, Dropdowns, Scrollbars, Karten, Sidebar und
  Dashboard-Hierarchie benutzen **nur** die Suite-Tokens. Begrüßungen über
  `suiteGreeting()`. Die Desktop-Sidebar ist 256/80 px.
- Kommentare: nur wo sie das *Warum* erklären. Keine Kommentare, die den Code nacherzählen.
- Keine neue Abhängigkeit ohne eigene Freigabe (siehe Abschnitt 9).
- Keine Umformatierung von Code, der nicht zur Aufgabe gehört. Das versteckt die
  eigentliche Änderung.

## 6. Verbotene Pfade

Diese Dateien und Verzeichnisse werden von Agenten **nicht geändert**. Wer sie ändern
müsste, bricht ab und fragt zurück.

| Pfad | Grund |
|---|---|
| `.github/workflows/**` | CI und Deployment — nur mit Freigabe des Nutzers |
| `migrations/postgresql/**` (bestehende Dateien) | eine angewandte Migration wird nie geändert; nur neue hinzufügen |
| `internal/**` (fachliche Änderungen) | **gesperrt, bis die Testabdeckung steht** — siehe Abschnitt 4 |
| `Dockerfile` | Laufzeit und Deployment |
| `web/src/cores-theme.css`, `web/src/lib/cores-design.ts`, `web/src/lib/SuiteLanguageSwitcher.tsx`, `web/src/lib/cores-locales/**` | erzeugt aus `cores/theme/` |
| `.env`, `.env.*` | enthält Secrets |
| `web/package-lock.json` | nur als Nebenwirkung eines freigegebenen Updates |
| `AGENTS.md` | diese Regeln ändert der Nutzer, nicht ein Agent |

## 7. Secrets

- **Keine Secrets in Repository, Kommentar, Dokument oder Log.** Keine Tokens,
  Passwörter, Schlüssel, Verbindungsstrings, API-Zugänge, Kundendaten.
- Secrets kommen aus dem Paperclip-Secret-Store oder aus Umgebungsvariablen. Sie
  werden nie in eine Datei geschrieben und nie ausgegeben.
- Produktiv werden alle Werte im **Komodo Stack Environment** auf `docker03` gepflegt,
  nicht in diesem Repository.
- `.env.example` enthält nur Namen und Beispielwerte, nie echte Werte.
- Testdaten sind erfunden. Keine kopierten Produktionsdaten, auch nicht gekürzt.
- Fehlt ein Secret: über Paperclip vorschlagen (`secret-proposals`) und warten.
  Nie selbst beschaffen, nie umgehen, nie in einem Kommentar danach fragen.
- Ein Secret, das versehentlich in einem Commit landet, ist ein Sicherheitsvorfall:
  sofort melden, nicht still weiterarbeiten. Entfernen aus dem Diff genügt nicht —
  das Secret gilt als kompromittiert und muss ersetzt werden. **Alle Cores-Repositories
  sind öffentlich.** Ein Fehler hier ist sofort weltweit sichtbar.

## 8. Harte Grenzen

Diese sechs Regeln stehen über jeder Aufgabenbeschreibung. Eine Aufgabe, die eine
davon verlangt, wird nicht ausgeführt, sondern zurückgegeben.

1. **Keine Schreibzugriffe auf produktive Datenbanken.** Lesen ist erlaubt. Schreiben,
   ändern, löschen, Migrationen fahren: nicht in Produktion. Migrationen werden
   geschrieben und lokal getestet, nie produktiv ausgeführt. Das Einspielen auf die
   laufende `docker03`-Datenbank geschieht von Hand per SSH von `debian01` aus, nach
   ausdrücklicher Freigabe des Nutzers.
2. **Keine produktiven Deployments ohne menschliche Freigabe.** Auch nicht nach
   grünem Review.
3. **Entwicklung nur in isolierten Branches oder Git-Worktrees.** Niemals direkt auf
   `main` oder einem anderen geschützten Branch.
4. **Tests vor jedem Pull Request.** Kein PR ohne protokollierten, grünen Testlauf.
5. **Keine Secrets in Repository, Kommentar, Dokument oder Log.**
6. **Bestehende Architektur zuerst verstehen.** Architektur-Doku und diese Datei vor
   dem Schreiben lesen. Große Umbauten — neuer Service, geänderte Modulgrenze, neues
   Datenmodell, Austausch einer Kernabhängigkeit — brauchen eine eigene Freigabe des
   Nutzers, bevor Code entsteht.

## 9. Freigabe-Gates

| Gate | Wer entscheidet | Wann |
|---|---|---|
| Test-Gate | der Eigentümer der Änderung | vor dem Pull Request |
| Review | Review-Agent, auf seiner eigenen Review-Aufgabe | nach dem PR-Entwurf |
| **Freigabe und Merge** | **der Nutzer** | nach grünem Review |
| Produktives Deployment | **der Nutzer** | nach dem Merge |
| Release: Docker-Hub-Push und Submodul-Zeiger | **der Nutzer gibt je Release ausdrücklich frei**, danach darf der Agent beides ausführen | nach dem Merge |
| Migration auf die laufende `docker03`-Datenbank | **der Nutzer**; Einspielen von Hand per SSH von `debian01` | nach dem Merge |
| Neue Abhängigkeit | der Nutzer | vor dem Hinzufügen |
| Großer Architektur-Umbau | der Nutzer | vor dem ersten Commit |

Was ein Agent in diesem Repository **nie** tut:

- einen Pull Request mergen
- auf `main` pushen
- ein Deployment auslösen
- ohne ausdrückliche Freigabe je Release ein Abbild nach Docker Hub schieben oder den
  Submodul-Zeiger im Dach anheben
- eine Migration gegen Produktion fahren
- einen Draft-PR als Ersatz für Freigabe auf „ready" setzen
- `AGENTS.md` oder CI-Dateien ändern

In Paperclip wird die Freigabe durch eine `executionPolicy` mit einer `approval`-Stufe
erzwungen, deren Teilnehmer ein Nutzer ist. Kein Agent kann sie abhaken.

## 10. Branches, Commits, Pull Requests

- Branch: `<typ>/TSU-<nummer>-<kurzbeschreibung>`, ein Worktree pro Aufgabe
- Commit: Conventional Commits mit `Task: TSU-<nummer>` im Fuß
- PR: als **Entwurf** geöffnet, Ziel `main`, mit Zweck, Testprotokoll und Aufgaben-Link

Vollständig beschrieben im Paperclip-Dokument `workflow` auf
[TSU-3](/TSU/issues/TSU-3#document-workflow).

## 11. Abbrechen und zurückfragen

Abbrechen ist richtig, nicht peinlich. Zurückfragen bei:

- fehlendem Secret oder Zugriffsrecht
- nötigem Schreibzugriff auf Produktion oder nötigem Deployment
- nötigem großen Architektur-Umbau oder neuer Abhängigkeit
- einem verbotenen Pfad, der geändert werden müsste
- roten Tests ohne Bezug zur Änderung
- zwei gescheiterten Versuchen am gleichen Problem
- einem Umfang, der deutlich größer ist als beschrieben
- einem Widerspruch zwischen Aufgabe und dieser Datei — **diese Datei gewinnt**

Erst alles fertig machen, was ohne die Antwort geht. Dann fragen.

## 12. Bekannte Fallen

- **Fachliche Änderungen sind gesperrt, bis die Testabdeckung steht.** Siehe
  Abschnitt 4. Das ist eine Entscheidung des Nutzers, keine Empfehlung.
- **Gesundheit ist `GET /health`, nicht `/api/health`.** `/api/health` ist der
  SPA-Rückfallpfad und antwortet auch, wenn der Dienst krank ist.
  `cores/scripts/check-release.sh` erzwingt das.
- **Ports sind unterschiedlich.** Intern 8080, nach außen 8083. Wer 8080 nach außen
  erwartet, sucht lange.
- **Das Schema kommt aus der Suite-Spur**, nicht aus diesem Repository.
  `036_planner_initial_schema.sql` in `cores/migrations/postgresql/` erzeugt die 20
  Tabellen. Hier liegen nur `003` und `004`.
- **`CGO_ENABLED=1`.** Ohne `gcc` scheitert der Build mit irreführender Meldung.
- **`cores/docker-compose.yml` beschreibt PlannerCore als „(Node.js)".** Falsch — der
  Dienst ist Go.
- **Das Frontend hat kein `lint`- und kein `test`-Skript.** `npm run build` ist die
  einzige automatische Prüfung. Wer hier etwas ändert, hat kaum ein Netz.

### Suite-weite Fallen, die auch hier gelten

- **Zwei Migrationsspuren.** Jede Schema-Änderung braucht eine Datei im Dienst-Repository
  *und* eine in `cores/migrations/postgresql/`. Die Nummern gehören paarweise.
- **Das Init-Verzeichnis läuft nur bei leerem Datenverzeichnis.**
  `cores/migrations/postgresql/` greift auf `docker03` nicht.
- **Eine Datenbank für alle.** PostgreSQL 16, rund 130 Tabellen, kein Schema pro Dienst.
  Eine Tabellenänderung kann fremde Dienste treffen.
- **Nur das Dachrepository hat heute CI.** Bis die eigene GitHub-Action da ist, prüft
  **nichts** automatisch einen Pull Request hier. Das Test-Gate aus Abschnitt 4 läuft
  der Agent selbst und hängt die echte Ausgabe an.
- **Alle Repositories sind öffentlich.**
