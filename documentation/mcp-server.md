# Anforderungsdefinition: MCP-Server

**Status:** Phase 1 umgesetzt in Version 1.3.0 (Zugriffstokens, alle Tools); Phase 2 (OAuth) ist nicht umgesetzt. Dieses Dokument ergänzt die [Anforderungsdefinition](overall-requirements.md); deren Festlegungen (insbesondere Zero Trust §11 und Präzisierungen §14) sowie die Regeln aus [rollen-und-rechte.md](rollen-und-rechte.md) und [mandanten.md](mandanten.md) gelten hier unverändert. Abschnittsverweise der Form „§n“ beziehen sich auf die Anforderungsdefinition.

## 1. Ziel und Abgrenzung

Der To-Do-Manager stellt einen Server nach dem Model Context Protocol (MCP) bereit. Damit kann ein KI-Assistent (z. B. Claude, ChatGPT oder ein Coding-Assistent in der Entwicklungsumgebung) im Auftrag eines Benutzers To-Dos anlegen, aktualisieren, kommentieren und überwachen.

- Die KI handelt immer **als ein bestimmter Benutzer in genau einem Mandanten** und hat nie mehr Rechte als dieser Benutzer
- Der MCP-Server ist eine weitere Schnittstelle neben der Web-Oberfläche, keine eigene Fachlogik
- Die Anwendung selbst enthält keine KI und ruft kein Sprachmodell auf

## 2. Anwendungsfälle

- **Erfassen:** „Leg mir für das Projekt Website ein To-Do an: Impressum prüfen, fällig Freitag, Priorität hoch.“
- **Aktualisieren:** „Setz das To-Do ‚Impressum prüfen‘ auf In Arbeit und schreib als Kommentar, dass ich auf die Rechtsabteilung warte.“
- **Aus anderem Kontext übernehmen:** Aufgaben aus einem Besprechungsprotokoll, einer E-Mail oder einem Code-Review als To-Dos anlegen
- **Überwachen:** „Was ist bei mir überfällig?“, „Was hat sich seit gestern in Projekt X geändert?“, eine tägliche Zusammenfassung durch einen zeitgesteuerten Agenten

## 3. Architektur

- **Endpunkt im bestehenden Server:** Der MCP-Server läuft im selben Node.js-Prozess unter `/mcp` (Transport „Streamable HTTP“). Er arbeitet **zustandslos**: Jede Anfrage trägt ihre Anmeldung selbst, es gibt keine serverseitige MCP-Sitzung. Das passt zum Betrieb als ein Prozess (§10) und funktioniert hinter dem Reverse Proxy ohne Zusatzkonfiguration
- **Gemeinsame Service-Schicht:** Die Fachlogik (Rechteprüfung, Standardstatus, Tags, Links, Verlauf, Ereignisse, E-Mails) liegt in Service-Funktionen, die REST-API und MCP-Server gleichermaßen aufrufen. Der MCP-Server enthält keine eigene Datenbanklogik. Voraussetzung für die Umsetzung ist daher, die heute in den HTTP-Routen liegende Logik in diese Service-Schicht zu verschieben, ohne das Verhalten der REST-API zu ändern
- **Implementierung:** offizielles MCP-SDK für TypeScript (Version 2, Paket `@modelcontextprotocol/server`); Eingaben werden wie in der REST-API mit Zod geprüft. Der Endpunkt bedient sowohl Clients nach der MCP-Spezifikation 2026-07-28 als auch ältere Clients (Spezifikation 2025, zustandslos ohne Sitzungs-ID); GET und DELETE auf `/mcp` werden mit 405 beantwortet
- **Herkunft der Anfrage:** Sendet ein Client einen `Origin`-Header (Browser), muss er der Adresse der Anwendung (`BASE_URL`) entsprechen; sonst wird die Anfrage abgelehnt
- **Live-Aktualisierung:** Änderungen über MCP lösen dieselben Ereignisse aus wie Änderungen in der Oberfläche; geöffnete Boards aktualisieren sich sofort (§9)

**Bewusst verworfene Alternativen:**

| Alternative | Grund |
| --- | --- |
| Direkter Datenbankzugriff durch den MCP-Server | Umgeht Rechteprüfung, Mandantentrennung, Verlauf, Live-Aktualisierung und E-Mails; widerspricht Zero Trust (§11) |
| Separater lokaler MCP-Server (stdio), der die REST-API aufruft | Muss von jedem Benutzer selbst installiert werden und braucht trotzdem eine Anmeldung per Token; allenfalls als kurzfristiger Prototyp sinnvoll |
| REST-Endpunkte 1:1 als Tools abbilden | Zu viele, zu technische Tools; KI-Assistenten arbeiten mit wenigen, fachlich geschnittenen Tools zuverlässiger |

## 4. Anmeldung

### Phase 1: Zugriffstokens

Die KI meldet sich mit einem persönlichen Zugriffstoken an, das im Header `Authorization: Bearer <Token>` übertragen wird. Das unterstützen u. a. Claude Code, Claude Desktop, VS Code und Cursor.

- **Anlegen:** Jeder Benutzer legt unter **Einstellungen → Zugriffstokens für KI-Assistenten** eigene Tokens an (höchstens 20 gültige Tokens je Mitgliedschaft). Personen ohne Login haben keine Tokens. Ein Token gilt für **genau einen Mandanten**, nämlich den beim Anlegen aktiven; ein Mandantenwechsel über MCP ist nicht möglich
- **Angaben je Token:** Bezeichnung (z. B. „Claude Laptop“), Berechtigung, Ablaufdatum, optional „nur eigene To-Dos“
- **Berechtigungen:**
  - **Lesen:** nur lesende Tools
  - **Lesen und Schreiben:** zusätzlich Anlegen, Ändern, Kommentieren und Canceln
  - **Nur eigene To-Dos** (zusätzlich wählbar): Schreiben ist auf To-Dos beschränkt, die dem Benutzer zugewiesen sind oder die er selbst angelegt hat, auch wenn seine Projektrolle mehr erlaubt
- **Ablauf:** Standard 90 Tage, höchstens `MCP_TOKEN_MAX_DAYS` Tage; unbefristete Tokens gibt es nicht
- **Anzeige:** Das Token wird nur einmal beim Anlegen angezeigt. Es beginnt mit dem Präfix `fgtm_pat_`, damit es in Quellcode und Logs erkennbar ist. Gespeichert wird nur ein Hash (wie bei Sitzungen)
- **Übersicht:** Der Benutzer sieht seine Tokens aller Mandanten mit Bezeichnung, Mandant, Berechtigung, Ablaufdatum und letzter Nutzung (auf die Minute genau) und kann sie jederzeit widerrufen. Widerrufene Tokens werden nicht mehr angezeigt
- **Ungültig werden Tokens** bei Ablauf, Widerruf, Deaktivierung oder Pseudonymisierung der Mitgliedschaft, Deaktivierung des Kontos oder des Mandanten sowie beim Zurücksetzen des Passworts (analog zu den Sitzungen, siehe [mandanten.md](mandanten.md))
- **Mandanten-Administrator:** Er legt unter **Administration → Zugriffstokens** fest, ob in seinem Mandanten Zugriffstokens erlaubt sind (Standard: nicht erlaubt), sieht alle Tokens des Mandanten (Person, Bezeichnung, Berechtigung, letzte Nutzung, nicht das Token selbst) und kann sie widerrufen. Nimmt er die Erlaubnis zurück, funktionieren die bestehenden Tokens nicht mehr, bis er sie wieder erteilt
- Anfragen mit Token benötigen keinen CSRF-Schutz, da kein Cookie verwendet wird. Ein Token berechtigt **nur** für `/mcp`, nicht für die übrige REST-API

### Phase 2: OAuth

Für Web-basierte Connectors (z. B. in claude.ai oder ChatGPT), die eine Anmeldung nach der MCP-Autorisierungsspezifikation (OAuth 2.1) erwarten, kann später ein OAuth-Ablauf ergänzt werden. Der Benutzer meldet sich dabei im To-Do-Manager an, wählt Mandant und Berechtigung und bestätigt den Zugriff. Für die so erteilten Zugriffe gelten dieselben Regeln wie für Zugriffstokens; sie erscheinen in derselben Übersicht. Phase 2 wird erst umgesetzt, wenn Phase 1 im Einsatz ist.

## 5. Rechte und Mandantentrennung

- Jedes Tool prüft serverseitig Anmeldung, Mandantenmitgliedschaft, Projektrolle und Objektzugriff, genau wie die REST-API (§11, §13)
- Maßgeblich ist das **Minimum** aus Projektrolle des Benutzers und Berechtigung des Tokens
- Nicht sichtbare Projekte, To-Dos und Personen werden wie nicht vorhanden behandelt ([rollen-und-rechte.md](rollen-und-rechte.md))
- To-Dos archivierter Projekte sind auch über MCP schreibgeschützt
- Systemadministratoren haben über MCP keine besonderen Rechte

## 6. Tools

| Tool | Zweck | Berechtigung | Kennzeichnung |
| --- | --- | --- | --- |
| `list_reference_data` | Status (mit Kategorie), Prioritäten, Projekte, Tags und zuweisbare Personen, soweit für den Benutzer sichtbar | Lesen | nur lesend |
| `search_todos` | To-Dos suchen und filtern | Lesen | nur lesend |
| `get_todo` | Ein To-Do mit allen Feldern, optional mit Kommentaren und Verlauf | Lesen | nur lesend |
| `get_overview` | Überblick: überfällig, heute und in den nächsten 7 Tagen fällig, Anzahl je Status; für „Meine“ oder ein Projekt | Lesen | nur lesend |
| `get_changes_since` | Änderungen an sichtbaren To-Dos seit einem Zeitpunkt (aus dem Verlauf und den Kommentaren) | Lesen | nur lesend |
| `create_todo` | To-Do anlegen | Schreiben | – |
| `update_todo` | Einzelne Felder ändern (Titel, Beschreibung, Status, Priorität, Fälligkeit, Zuweisung, Projekt, Tags, Links) | Schreiben | – |
| `add_comment` | Kommentar hinzufügen | Schreiben | – |
| `cancel_todo` | To-Do canceln (§14) | Schreiben | destruktiv |

Die Kennzeichnung wird über die Tool-Annotationen des MCP-Protokolls (`readOnlyHint`, `destructiveHint`) mitgeteilt, damit KI-Clients vor destruktiven Aktionen nachfragen können.

**Filter von `search_todos`:** „Meine“ oder „Alle“ (§14; Standard bei der Suche: „Alle“, bei `get_overview`: „Meine“), Text in Titel und Beschreibung, Status, Statuskategorie (offen, erledigt, abgebrochen), Projekt bzw. „ohne Projekt“, Tag, Person bzw. „nicht zugewiesen“, Priorität, Fälligkeit von/bis, „überfällig“. Wie auf dem Board sind erledigte und abgebrochene To-Dos ohne ausdrückliche Angabe ausgeblendet. Sortierung wie auf dem Board (§5, §14).

**Regeln für alle Tools:**

- **Namen statt IDs:** Status, Prioritäten, Projekte, Tags und Personen können mit ihrem Namen angegeben werden (ohne Unterscheidung von Groß- und Kleinschreibung). Ist ein Name unbekannt oder mehrdeutig, antwortet das Tool mit einer Fehlermeldung, die die gültigen Werte nennt. IDs werden ebenfalls akzeptiert
- **Kompakte Antworten:** Listen enthalten je To-Do nur ID, Titel, Status, Priorität, Projekt, Zuständig, Fälligkeit, Tags und den Deep Link (`<BASE_URL>/todos/<ID>`). Beschreibung, Kommentare und Verlauf liefert `get_todo`
- **Begrenzung:** Listen liefern standardmäßig 25, höchstens 100 Einträge und einen Hinweis, ob weitere vorhanden sind (Fortsetzung über einen Cursor). `get_changes_since` reicht höchstens 30 Tage zurück, liefert die neuesten Einträge zuerst und blättert über den Parameter `until` weiter zurück
- **IDs und Links:** Wo ein To-Do erwartet wird, akzeptieren die Tools seine ID oder seinen Deep Link
- **Idempotenz:** `create_todo` akzeptiert einen Idempotenzschlüssel; derselbe Schlüssel liefert das bereits angelegte To-Do zurück, statt ein neues anzulegen (gleicher Mechanismus wie die Geräte-ID der Schnellerfassung, siehe [mobile-offline.md](mobile-offline.md))
- **Standardwerte beim Anlegen:** Ohne Status gilt der Standardstatus für neue To-Dos; ohne Zuweisung bleibt das To-Do unzugewiesen. Zuweisungsregeln gelten wie in der Oberfläche ([rollen-und-rechte.md](rollen-und-rechte.md))
- **Sprache:** Namen von Standard-Status und -Prioritäten sowie Fehlermeldungen erscheinen in der Sprache des Benutzers
- **Fehler:** Fehlende Rechte, nicht gefundene Objekte und ungültige Eingaben werden als verständliche Fehlermeldung an die KI zurückgegeben, ohne Informationen über nicht sichtbare Daten preiszugeben
- Es gibt keine Tools für Massenänderungen

## 7. Überwachen

MCP arbeitet nur auf Abruf: Die KI fragt Daten ab, wenn sie gerade eingesetzt wird; sie wird vom To-Do-Manager nicht benachrichtigt.

- Das Überwachen erfolgt über `get_overview` und `get_changes_since`
- Eine regelmäßige Überwachung (z. B. tägliche Zusammenfassung) richtet der Benutzer in seinem KI-Werkzeug als zeitgesteuerte Aufgabe ein, die diese Tools aufruft; der To-Do-Manager bietet dafür keine eigene Funktion
- Benachrichtigungen über MCP (Resource-Subscriptions) werden nicht angeboten, da KI-Clients sie kaum unterstützen und eine KI nicht dauerhaft läuft
- Ausgehende Webhooks bei Änderungen sind eine mögliche spätere Erweiterung und nicht Teil dieses Konzepts

## 8. Sicherheit und Nachvollziehbarkeit

- **Herkunft im Verlauf:** Jede Änderung über MCP wird im Verlauf wie gewohnt dem Benutzer zugeordnet und zusätzlich als „über MCP (Bezeichnung des Tokens)“ gekennzeichnet; die Kennzeichnung ist im Verlauf des To-Dos sichtbar. Dasselbe gilt für Kommentare. Kachel und Listen-Export zeigen keine Kennzeichnung. Die Kennzeichnung bleibt beim Export und Import eines Mandanten erhalten (siehe [mandanten.md](mandanten.md))
- **Prompt-Injection:** Titel, Beschreibungen und Kommentare stammen von anderen Personen und können Anweisungen an die KI enthalten. Gegenmaßnahmen: Tokens sind standardmäßig nur lesend, „nur eigene To-Dos“ ist wählbar, destruktive Tools sind gekennzeichnet, es gibt keine Massenänderungen, und Inhalte werden als Datenfelder getrennt von Status- und Fehlermeldungen zurückgegeben
- **Frequenzbegrenzung:** höchstens `MCP_RATE_LIMIT` Anfragen pro Minute und Token; schreibende Tools zusätzlich höchstens ein Drittel davon. Überschreitungen werden mit einer Fehlermeldung abgewiesen
- **E-Mails:** Zuweisungen über MCP lösen die üblichen Zuweisungs-E-Mails aus (§9, §14); die Frequenzbegrenzung verhindert eine E-Mail-Flut
- **Protokollierung:** Fehlgeschlagene Anmeldungen mit Token werden protokolliert und unterliegen je IP-Adresse der Begrenzung von Anmeldeversuchen (`AUTH_RATE_LIMIT`). Token-Werte erscheinen nie im Log
- **Transport:** Im Produktivbetrieb nur über HTTPS (Reverse Proxy)

## 9. Nicht im Umfang

- System- und Mandantenverwaltung (Mandanten, Export/Import, Benutzer, Einladungen, Rollen)
- Verwaltung von Status, Prioritäten, Projekten und Tags (Umbenennen, Einfärben, Löschen); neue Tags entstehen wie in der Oberfläche beim Bearbeiten eines To-Dos
- Gespeicherte Filter, Benutzereinstellungen, Benachrichtigungseinstellungen
- Listen-Export (Excel/CSV)
- Endgültiges Löschen (gibt es generell nicht, siehe [rollen-und-rechte.md](rollen-und-rechte.md))
- Zugriff auf mehrere Mandanten mit einem Token

## 10. Konfiguration

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `MCP_ENABLED` | `false` | Schaltet den MCP-Endpunkt `/mcp` und die Verwaltung der Zugriffstokens ein |
| `MCP_RATE_LIMIT` | `60` | Max. MCP-Anfragen pro Minute und Token |
| `MCP_TOKEN_MAX_DAYS` | `365` | Höchste Gültigkeit eines Zugriffstokens in Tagen |

Zusätzlich muss der Mandanten-Administrator Zugriffstokens für seinen Mandanten erlauben (§4). Das README beschreibt Einrichtung und Konfiguration eines KI-Clients für Administratoren und Benutzer.

## 11. Umsetzungsschritte

1. Fachlogik der To-Do-Routen in eine Service-Schicht verschieben; das Verhalten der REST-API bleibt unverändert und wird durch die bestehenden Tests abgesichert
2. Zugriffstokens: Datenmodell, Verwaltung in Einstellungen und Administration, Herkunftskennzeichnung im Verlauf, Übersetzungen (de/en)
3. MCP-Endpunkt mit den lesenden Tools
4. Schreibende Tools
5. Optional: OAuth (§4, Phase 2)

## 12. Tests

- Mandantentrennung: Ein Token sieht und ändert nie Daten eines anderen Mandanten, auch nicht mit fremden IDs
- Rechte: Jedes Tool respektiert Projektrollen, die Token-Berechtigung und „nur eigene To-Dos“; nicht sichtbare Objekte führen zu „nicht gefunden“
- Token-Lebenszyklus: Ablauf, Widerruf, Deaktivierung, Pseudonymisierung, Passwort zurücksetzen und Sperre durch den Mandanten-Administrator machen Tokens ungültig
- Idempotenz von `create_todo`, Auflösung von Namen inkl. mehrdeutiger und unbekannter Namen
- Verlauf und Live-Ereignisse bei Änderungen über MCP
- Alle Tests laufen gegen SQLite und PostgreSQL (§10)

## 13. Entscheidungen

Mit dem Auftraggeber abgestimmt (ursprünglich offene Fragen des Konzepts):

- Zugriffstokens sind je Mandant standardmäßig **nicht erlaubt**; der Mandanten-Administrator schaltet sie ein. Auch ein importierter Mandant startet ohne Erlaubnis
- Die Kennzeichnung „über MCP“ erscheint **im Verlauf und an Kommentaren**, nicht auf der Kachel und nicht im Listen-Export
- Ein **Leser** darf über MCP kommentieren, wenn sein Token „Lesen und Schreiben“ hat (wie in der Oberfläche, §9); alle anderen schreibenden Tools scheitern an seiner Rolle
- „Nur eigene To-Dos“ bedeutet: dem Benutzer zugewiesen **oder** von ihm angelegt (unabhängig von der Zuweisung). Zuweisen darf ein solches Token nur sich selbst oder niemanden; Kommentare sind ebenfalls auf eigene To-Dos beschränkt. Lesen ist nicht eingeschränkt
