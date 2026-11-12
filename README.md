# FG To-Do-Manager

Mandantenfähige To-Do-Verwaltung mit Kanban-Oberfläche für Einzelpersonen und Teams. Web-Anwendung für Desktop, Tablet und Smartphone (installierbar als Progressive Web App). Oberfläche auf Deutsch und Englisch.

Version 1.0.0. Funktionsumfang:

- Kanban-Board nach Status, Personen oder Tags sowie Raster-Ansicht (Status × Personen), Drag and Drop, Filter, gespeicherte Filter und Sortierung
- Projekte mit Projektrollen (Bearbeiter, eingeschränkter Bearbeiter, Leser), Archivieren und Wiederherstellen
- To-Dos mit Priorität, Fälligkeit, Tags, Links, Kommentaren und vollständigem Änderungsverlauf
- Live-Aktualisierung, E-Mail-Benachrichtigungen und Fälligkeitserinnerungen
- Teilen per Link, Export der Ansicht als Excel/CSV
- Installierbare Smartphone-App (PWA) mit Offline-Schnellerfassung
- Mehrere Mandanten mit strikter Datentrennung, Systemverwaltung mit Export/Import je Mandant
- SQLite oder PostgreSQL, Migrationsskript von SQLite nach PostgreSQL

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

Jeder Benutzer legt unter **Einstellungen → Benachrichtigungen** fest, ob er E-Mails bei neuen Zuweisungen, Erinnerungen vor Fälligkeit (Anzahl Tage) und Meldungen bei Überfälligkeit erhalten möchte; die Einstellungen gelten für alle seine Mandanten. Für den Versand muss `MAIL_TRANSPORT=smtp` konfiguriert sein.

**Smartphone:** Die Anwendung lässt sich im Browser des Smartphones „zum Startbildschirm hinzufügen“ und startet dann wie eine App in der **Schnellerfassung**. Neue To-Dos können auch ohne Netzverbindung erfasst werden; sie werden auf dem Gerät gespeichert und automatisch übertragen, sobald wieder eine Verbindung besteht. Offline ist der zuletzt geladene Stand des Boards schreibgeschützt sichtbar. Installation und Offline-Betrieb erfordern HTTPS (siehe Reverse Proxy).

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
- Benutzer und To-Dos werden nie physisch gelöscht, sondern nur deaktiviert bzw. pseudonymisiert (Ausnahme: „Mandant ersetzen“ in der Systemverwaltung).
- Jede Anfrage wird serverseitig auf Anmeldung, Mandant, Rolle und Objektzugriff geprüft; Mandanten sind vollständig voneinander getrennt.
