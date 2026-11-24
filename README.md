# FG To-Do-Manager

Mandantenfähige To-Do-Verwaltung mit Kanban-Oberfläche für Einzelpersonen und Teams. Web-Anwendung für Desktop, Tablet und Smartphone (installierbar als Progressive Web App). Oberfläche auf Deutsch und Englisch.

Version 1.0.1. Funktionsumfang:

- Kanban-Board nach Status, Personen, Prioritäten oder Tags sowie Raster-Ansicht (Status × Personen), Drag and Drop, Filter, gespeicherte Filter und Sortierung
- Projekte mit Projektrollen (Bearbeiter, eingeschränkter Bearbeiter, Leser), Archivieren und Wiederherstellen
- To-Dos mit Priorität, Fälligkeit, Tags, Links, Kommentaren und vollständigem Änderungsverlauf
- Live-Aktualisierung, E-Mail-Benachrichtigungen und Fälligkeitserinnerungen
- Teilen per Link, Export der Ansicht als Excel/CSV
- Installierbare Smartphone-App (PWA) mit Offline-Schnellerfassung
- Mehrere Mandanten mit strikter Datentrennung, Systemverwaltung mit Export/Import je Mandant
- SQLite oder PostgreSQL, Migrationsskript von SQLite nach PostgreSQL
- MCP-Server für KI-Assistenten (z. B. Claude): To-Dos per KI anlegen, aktualisieren und überwachen, mit persönlichen Zugriffstokens

## Voraussetzungen

- Node.js **22.12 oder neuer** (empfohlen: aktuelle LTS-Version)
- Datenbank: **SQLite** (eingebaut, keine Installation nötig) oder **PostgreSQL** ab Version 14
- Ein SMTP-Zugang für den E-Mail-Versand (Einladungen, Passwort zurücksetzen)
- Für den Produktivbetrieb: ein Reverse Proxy mit TLS (z. B. Caddy oder nginx)

Ein kleiner virtueller Server (1 vCPU, 1–2 GB RAM) reicht für den Betrieb aus.

## Installation

```bash
git clone <repository-url> todo-manager
cd todo-manager
npm ci
npm run build
cp .env.example .env
```

Danach `.env` anpassen (siehe [Konfiguration](#konfiguration)) und das Setup ausführen:

```bash
npm run setup -- --email admin@example.com --name "Administrator"
```

Das Setup legt das Datenbankschema an bzw. aktualisiert es und erstellt den ersten **Systemadministrator**. Das Passwort wird abgefragt (mindestens 10 Zeichen). Alternativ können die Werte über `SETUP_ADMIN_EMAIL`, `SETUP_ADMIN_NAME` und `SETUP_ADMIN_PASSWORD` übergeben werden. Existiert die E-Mail-Adresse bereits, wird der Benutzer zum Systemadministrator gemacht und sein Passwort neu gesetzt.

Nur das Datenbankschema aktualisieren (z. B. nach einem Update):

```bash
npm run setup -- --migrate-only
```

Anwendung starten:

```bash
npm start
```

Die Anwendung ist anschließend unter `BASE_URL` erreichbar (standardmäßig `http://localhost:3000`).

## Erste Schritte

1. Als Systemadministrator anmelden.
2. Unter **Systemverwaltung** einen Mandanten anlegen. Dabei werden Name und E-Mail-Adresse des ersten Mandanten-Administrators angegeben; diese Person erhält automatisch eine Einladung per E-Mail.
3. Der Mandanten-Administrator nimmt die Einladung über den Link an (7 Tage gültig, einmal verwendbar) und legt dabei sein Passwort fest.

Jeder neue Mandant startet mit den Standard-Status (Backlog, In Arbeit, Under Review, Erledigt, Abgelehnt, Gelöscht) und den Standard-Prioritäten (Kritisch, Hoch, Mittel, Niedrig).

Der Mandanten-Administrator lädt unter **Administration → Benutzer** weitere Personen ein und legt dort Mandantenrolle und Standardrolle (für To-Dos ohne Projekt) fest. Projekte und die Rollen der Personen in Projekten (Bearbeiter, eingeschränkter Bearbeiter, Leser) werden unter **Projekte** verwaltet. Status, Prioritäten und Tags werden unter **Administration** angepasst.

**Personen ohne Login:** To-Dos können auch Personen zugewiesen werden, die (noch) kein Benutzerkonto haben, z. B. externe Ansprechpartner. Mandanten- und Projektadministratoren legen sie unter **Projekte → Personen ohne Login** an (nur ein Name) und ordnen sie über **Mitglieder** einem oder mehreren Projekten zu; zuweisen lassen sie sich nur in diesen Projekten. Personen ohne Login können sich nicht anmelden und erhalten keine E-Mails. Soll eine solche Person später selbst mitarbeiten, wählt der Mandanten-Administrator unter **Administration → Benutzer** bei ihr **Zum Benutzer machen** und gibt ihre E-Mail-Adresse an. Sie erhält eine Einladung; nach dem Annehmen behält sie alle ihr zugewiesenen To-Dos und ist in ihren Projekten eingeschränkter Bearbeiter.

Jeder Benutzer legt unter **Einstellungen → Benachrichtigungen** fest, ob er E-Mails bei neuen Zuweisungen, Erinnerungen vor Fälligkeit (Anzahl Tage) und Meldungen bei Überfälligkeit erhalten möchte; die Einstellungen gelten für alle seine Mandanten. Für den Versand muss `MAIL_TRANSPORT=smtp` konfiguriert sein.

Unter **Einstellungen → Board** legt jeder Benutzer fest, mit welcher Anzeige („Meine“ oder „Alle“) und welcher Ansicht (nach Status, nach Personen, nach Prioritäten, nach Tags oder Raster) sich das Board öffnet. Ohne Einstellung gelten „Meine“ und „Nach Status“.

**Smartphone:** Die Anwendung lässt sich im Browser des Smartphones „zum Startbildschirm hinzufügen“ und startet dann wie eine App in der **Schnellerfassung**. Neue To-Dos können auch ohne Netzverbindung erfasst werden; sie werden auf dem Gerät gespeichert und automatisch übertragen, sobald wieder eine Verbindung besteht. Offline ist der zuletzt geladene Stand des Boards schreibgeschützt sichtbar. Installation und Offline-Betrieb erfordern HTTPS (siehe Reverse Proxy).

Hinterlegte Links eines To-Dos lassen sich direkt auf der Kachel über das 🔗-Symbol öffnen, ohne das To-Do aufzurufen (bei mehreren Links erscheint eine Auswahl).

Links zu einzelnen To-Dos (Teilen-Button) öffnen das To-Do nach der Anmeldung direkt – auch in einem anderen Mandanten, sofern die Person dort Zugriff hat. Die aktuelle Board-Ansicht inklusive Filter lässt sich über **Exportieren** als Excel- oder CSV-Datei herunterladen.

Personen, die bereits ein Konto in einem anderen Mandanten haben, nehmen Einladungen mit ihrem bestehenden Login an. Nach der Anmeldung öffnet sich der zuletzt genutzte Mandant; über den Umschalter in der Kopfzeile wird zwischen Mandanten gewechselt.

## Konfiguration

Die Konfiguration erfolgt über Umgebungsvariablen oder die Datei `.env` im Programmverzeichnis.

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Netzwerkschnittstelle |
| `BASE_URL` | `http://localhost:3000` | Öffentliche Adresse; wird für Links in E-Mails verwendet. Mit `https://` werden Sitzungs-Cookies automatisch als „Secure“ markiert. |
| `TRUST_PROXY` | `false` | Auf `true` setzen, wenn die Anwendung hinter einem Reverse Proxy läuft |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `DB_CLIENT` | `sqlite` | `sqlite` oder `pg` |
| `SQLITE_FILE` | `./data/todo-manager.db` | Pfad der SQLite-Datenbank |
| `DATABASE_URL` | – | PostgreSQL-Verbindung, z. B. `postgres://user:pass@localhost:5432/todo` (nur bei `DB_CLIENT=pg`) |
| `SESSION_TTL_HOURS` | `336` | Gültigkeit einer Anmeldung in Stunden (verlängert sich bei Nutzung) |
| `AUTH_RATE_LIMIT` | `10` | Max. Anmelde-, Passwort- und Einladungsanfragen pro Minute und IP-Adresse |
| `MAIL_TRANSPORT` | `log` | `smtp` für echten Versand; `log` schreibt E-Mails nur ins Server-Log (Test) |
| `MAIL_FROM` | – | Absenderadresse |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | – | SMTP-Zugangsdaten |
| `DEFAULT_LOCALE` | `de` | Standardsprache (`de` oder `en`) |
| `APP_TIMEZONE` | `Europe/Berlin` | Zeitzone für Fälligkeitsdaten und Erinnerungen |
| `REMINDER_INTERVAL_MINUTES` | `60` | Wie oft Fälligkeitserinnerungen geprüft werden (Minuten); `0` schaltet sie ab |
| `IMPORT_MAX_MB` | `50` | Maximale Größe einer Mandanten-Importdatei in MB |
| `MCP_ENABLED` | `false` | `true` bietet den MCP-Server für KI-Assistenten unter `/mcp` und die Verwaltung von Zugriffstokens an (siehe [KI-Assistenten anbinden](#ki-assistenten-anbinden-mcp-server)) |
| `MCP_RATE_LIMIT` | `60` | Max. MCP-Anfragen pro Minute und Zugriffstoken; schreibende Aktionen höchstens ein Drittel davon |
| `MCP_TOKEN_MAX_DAYS` | `365` | Höchste Gültigkeit eines Zugriffstokens in Tagen |

## KI-Assistenten anbinden (MCP-Server)

Über den MCP-Server (Model Context Protocol) können KI-Assistenten wie Claude, Claude Code, VS Code oder Cursor im Auftrag eines Benutzers To-Dos suchen, anlegen, ändern, kommentieren, canceln und Übersichten über fällige To-Dos abrufen. Die KI hat dabei nie mehr Rechte als der Benutzer selbst; jede Änderung erscheint im Verlauf des To-Dos als „über MCP“ mit der Bezeichnung des Tokens.

Einrichtung:

1. **Betreiber:** In `.env` `MCP_ENABLED=true` setzen und die Anwendung neu starten. Der Endpunkt lautet `<BASE_URL>/mcp`; im Produktivbetrieb nur über HTTPS.
2. **Mandanten-Administrator:** Unter **Administration → Zugriffstokens** „Zugriffstokens in diesem Mandanten erlauben“ einschalten. Dort sieht er alle Tokens des Mandanten und kann sie widerrufen.
3. **Benutzer:** Unter **Einstellungen → Zugriffstokens für KI-Assistenten** ein Token anlegen: Bezeichnung, Berechtigung („Lesen“ oder „Lesen und Schreiben“, optional nur eigene To-Dos) und Gültigkeit. Das Token gilt nur für den gerade aktiven Mandanten und wird nur einmal angezeigt.
4. Im KI-Werkzeug einen MCP-Server vom Typ HTTP mit der Adresse `<BASE_URL>/mcp` und dem Header `Authorization: Bearer <Token>` eintragen, z. B. in Claude Code:

   ```bash
   claude mcp add --transport http todo-manager https://todo.example.com/mcp --header "Authorization: Bearer fgtm_pat_…"
   ```

   Werkzeuge mit JSON-Konfiguration (z. B. VS Code, Cursor) erwarten in der Regel `"url": "https://todo.example.com/mcp"` und `"headers": { "Authorization": "Bearer fgtm_pat_…" }`.

Tokens werden ungültig, wenn sie ablaufen oder widerrufen werden, der Mandanten-Administrator die Erlaubnis zurücknimmt, die Person deaktiviert oder pseudonymisiert wird oder ihr Passwort über „Passwort vergessen“ zurücksetzt. Web-basierte Connectors, die eine Anmeldung per OAuth verlangen (z. B. in claude.ai), werden derzeit nicht unterstützt.

## Datenbank

- **SQLite** ist ideal für kleine Installationen: keine zusätzliche Software, die Datenbank ist eine einzelne Datei.
- **PostgreSQL** empfiehlt sich für größere Teams. Datenbank und Benutzer anlegen, `DB_CLIENT=pg` und `DATABASE_URL` setzen, dann `npm run setup` ausführen.

### Wechsel von SQLite zu PostgreSQL

Der Wechsel ist jederzeit möglich; der umgekehrte Weg wird nicht unterstützt.

1. Leere PostgreSQL-Datenbank mit Benutzer anlegen.
2. Anwendung stoppen (`sudo systemctl stop todo-manager`) und die SQLite-Datei sichern.
3. Migration ausführen:

   ```bash
   npm run migrate:sqlite-to-pg -- --from ./data/todo-manager.db --to postgres://user:pass@localhost:5432/todo
   ```

   Ohne Angaben werden `SQLITE_FILE` und `DATABASE_URL` aus der Konfiguration verwendet. Das Skript legt das Schema an, kopiert alle Daten in einer Transaktion und prüft anschließend die Anzahl der Datensätze je Tabelle. Ist die Zieldatenbank nicht leer, bricht es ohne Änderungen ab. Die SQLite-Datei bleibt unverändert.
4. In `.env` `DB_CLIENT=pg` und `DATABASE_URL` setzen und die Anwendung starten. Angemeldete Benutzer bleiben angemeldet.

## Betrieb hinter einem Reverse Proxy

Beispiel für **Caddy** (TLS-Zertifikat wird automatisch bezogen):

```
todo.example.com {
    reverse_proxy localhost:3000
}
```

Dazu in `.env`: `BASE_URL=https://todo.example.com` und `TRUST_PROXY=true`.

Die Live-Aktualisierung nutzt eine dauerhaft offene Verbindung (Server-Sent Events unter `/api/events`). Caddy unterstützt das ohne weitere Einstellungen. Bei **nginx** für diesen Pfad die Pufferung abschalten:

```
location /api/events {
    proxy_pass http://localhost:3000;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

Die Anwendung ist für den Betrieb als **ein** Prozess ausgelegt (Live-Aktualisierung und Erinnerungen laufen im Prozess).

## Als Dienst einrichten (systemd)

`/etc/systemd/system/todo-manager.service`:

```ini
[Unit]
Description=FG To-Do-Manager
After=network.target

[Service]
Type=simple
User=todo
WorkingDirectory=/opt/todo-manager
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now todo-manager
```

## Update

```bash
git pull
npm ci
npm run build
npm run setup -- --migrate-only
sudo systemctl restart todo-manager
```

## Export und Import einzelner Mandanten

Unter **Systemverwaltung** kann der Systemadministrator je Mandant:

- **Exportieren:** lädt alle Daten des Mandanten (Mitglieder, Projekte, To-Dos, Kommentare, Verlauf, Status, Prioritäten, Tags, gespeicherte Filter) als JSON-Datei herunter. Passwörter sind nicht enthalten; pseudonymisierte Personen werden ohne persönliche Daten exportiert.
- **Importieren:** legt aus einer Export-Datei einen **neuen** Mandanten an (auch in einer anderen Installation). Alle internen IDs werden neu vergeben. Personen werden anhand der E-Mail-Adresse einem vorhandenen Konto zugeordnet; für unbekannte Adressen wird ein Konto ohne Passwort angelegt, das Passwort setzt die Person über „Passwort vergessen“.
- **Ersetzen:** ersetzt einen bestehenden Mandanten vollständig durch den Inhalt einer Export-Datei. Dazu muss der Name des Mandanten zur Bestätigung eingegeben werden. Vorher unbedingt einen Export erstellen.

Andere Mandanten werden dabei nicht verändert.

## Datensicherung

Die regelmäßige Datensicherung erfolgt außerhalb der Anwendung:

- **SQLite:** die Datenbankdatei sichern, z. B. mit `sqlite3 data/todo-manager.db ".backup backup.db"` (sicher auch im laufenden Betrieb).
- **PostgreSQL:** mit `pg_dump` bzw. den Sicherungsfunktionen des Hosting-Anbieters.

## Sicherheit

- Passwörter werden mit Argon2id gehasht gespeichert.
- Sitzungen liegen serverseitig; das Sitzungs-Cookie ist `HttpOnly`, bei HTTPS zusätzlich `Secure`.
- Anmeldung, Passwort-vergessen und Einladungen sind gegen Massenversuche begrenzt.
- Zugriffstokens für den MCP-Server werden nur als Hash gespeichert, laufen ab, sind widerrufbar und gelten nur für `/mcp`, nicht für die übrige Anwendung. Anfragen je Token und fehlgeschlagene Anmeldungen je IP-Adresse sind begrenzt.
- Benutzer und To-Dos werden nie physisch gelöscht, sondern nur deaktiviert bzw. pseudonymisiert (Ausnahme: „Mandant ersetzen“ in der Systemverwaltung).
- Jede Anfrage wird serverseitig auf Anmeldung, Mandant, Rolle und Objektzugriff geprüft; Mandanten sind vollständig voneinander getrennt.
