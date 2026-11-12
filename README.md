# FG To-Do-Manager

Mandantenfähige To-Do-Verwaltung mit Kanban-Oberfläche für Einzelpersonen und Teams. Web-Anwendung für Desktop, Tablet und Smartphone (installierbar als Progressive Web App). Oberfläche auf Deutsch und Englisch.

> **Stand: Version 0.1.0 (Ausbaustufe 1 von 6).** Enthalten sind Installation, Anmeldung, Passwort-vergessen-Funktion, Einladungen, Mandantenwechsel und die Systemverwaltung (Mandanten anlegen und deaktivieren). Board, Projekte und To-Dos folgen in den nächsten Ausbaustufen.

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
| `MAIL_TRANSPORT` | `log` | `smtp` für echten Versand; `log` schreibt E-Mails nur ins Server-Log (Test) |
| `MAIL_FROM` | – | Absenderadresse |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | – | SMTP-Zugangsdaten |
| `DEFAULT_LOCALE` | `de` | Standardsprache (`de` oder `en`) |

## Datenbank

- **SQLite** ist ideal für kleine Installationen: keine zusätzliche Software, die Datenbank ist eine einzelne Datei.
- **PostgreSQL** empfiehlt sich für größere Teams. Datenbank und Benutzer anlegen, `DB_CLIENT=pg` und `DATABASE_URL` setzen, dann `npm run setup` ausführen.

Ein Wechsel von SQLite zu PostgreSQL ist vorgesehen (Migrationsskript folgt mit Version 1.0); der umgekehrte Weg wird nicht unterstützt.

## Betrieb hinter einem Reverse Proxy

Beispiel für **Caddy** (TLS-Zertifikat wird automatisch bezogen):

```
todo.example.com {
    reverse_proxy localhost:3000
}
```

Dazu in `.env`: `BASE_URL=https://todo.example.com` und `TRUST_PROXY=true`.

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

## Datensicherung

Die regelmäßige Datensicherung erfolgt außerhalb der Anwendung:

- **SQLite:** die Datenbankdatei sichern, z. B. mit `sqlite3 data/todo-manager.db ".backup backup.db"` (sicher auch im laufenden Betrieb).
- **PostgreSQL:** mit `pg_dump` bzw. den Sicherungsfunktionen des Hosting-Anbieters.

## Sicherheit

- Passwörter werden mit Argon2id gehasht gespeichert.
- Sitzungen liegen serverseitig; das Sitzungs-Cookie ist `HttpOnly`, bei HTTPS zusätzlich `Secure`.
- Anmeldung, Passwort-vergessen und Einladungen sind gegen Massenversuche begrenzt.
- Benutzer und To-Dos werden nie physisch gelöscht, sondern nur deaktiviert bzw. pseudonymisiert.
