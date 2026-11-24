# Anforderungsdefinition: To-Do-Manager-App

Größere Anforderungsbereiche sind in eigene Dokumente ausgelagert; sie sind in Abschnitt 15 aufgeführt und gelten ergänzend zu diesem Dokument.

## 1. Produktvision

Eine To-Do-Manager-App zur Verwaltung von Aufgaben für Einzelpersonen und/oder Teams. Leitprinzip: Einfachheit.

## 2. Zielgruppen

- Einzelpersonen
- Teams

## 3. Plattformen

- **Web-Anwendung:** Für umfangreichere Arbeit, z. B. Teams, Projekte und Themen konzipieren und strukturieren.
- **Mobile Oberfläche:** Für schnelles Erfassen neuer Aufgaben und Themen unterwegs. Muss besonders einfach sein.

## 4. Bedienkonzept / UI

- Kanban-artige Oberfläche
- Swimlanes zur Gliederung
- Jedes To-Do wird als einzelne Kachel (Karte) dargestellt
- Eine Fußzeile zeigt auf jeder Seite (auch vor der Anmeldung) die aktuelle Versionsnummer der Anwendung

## 5. Ansichten, Swimlanes und Tags

Mehrere umschaltbare Ansichten, besonders für komplexe Themen und größere Teams.

- **Swimlanes nach Status:** z. B. offen, in Arbeit, erledigt
- **Swimlanes nach Personen:** je zuständiger Person eine Lane
- **Swimlanes nach Prioritäten:** je Priorität eine Lane (in der Rangfolge, höchste zuerst) sowie „Keine Priorität“
- **Tags:** To-Dos lassen sich mit frei definierbaren Themen-Tags versehen
- **Ansichten nach Tags:** Swimlanes bzw. Ansichten je Themenbereich (Tag) erzeugen
- **Filter:** Schnelles Filtern und Suchen von To-Dos nach Tags/Themen

### Offline-Fähigkeit (Mobil)

Die mobile Schnellerfassung funktioniert auch ohne Netzverbindung; offline erfasste To-Dos werden automatisch übertragen, sobald wieder eine Verbindung besteht. Die vollständigen Anforderungen an Schnellerfassung, Offline-Betrieb und Synchronisation stehen in [mobile-offline.md](mobile-offline.md).

### Responsive Design

- Moderne, aufgeräumte Optik
- Die Oberfläche passt sich an jede Bildschirmgröße an und ist für Smartphone, Tablet und Desktop jeweils eigens optimiert (z. B. Kanban mit mehreren Spalten am Desktop, kompakte Darstellung und Touch-Bedienung am Smartphone)

### Raster-Ansicht und Sortierung

- **Raster-Ansicht:** Status als vertikale Spalten, Benutzer als horizontale Zeilen; jedes Feld zeigt die To-Dos dieser Kombination aus Status und Benutzer
- **Sortierung wählbar:** Der Benutzer wählt, wie Kacheln innerhalb einer Lane bzw. eines Feldes sortiert werden, z. B. nach Priorität, Status, Fälligkeitsdatum, Erfassungsdatum oder Änderungsdatum, jeweils auf- oder absteigend

### Drag and Drop

Kacheln lassen sich per Drag and Drop zwischen Swimlanes verschieben; die Wirkung hängt von der aktiven Ansicht ab.

- **Ansicht nach Personen:** Verschieben in eine andere Lane weist das To-Do der betreffenden Person zu
- **Ansicht nach Status:** Verschieben in eine andere Lane setzt den entsprechenden Status
- **Ansicht nach Prioritäten:** Verschieben in eine andere Lane setzt die entsprechende Priorität (bzw. entfernt sie in „Keine Priorität“)
- Verschieben ist nur möglich, wenn die Rolle des Benutzers die Änderung erlaubt

### Startansicht

- Nach dem Anmelden sieht der Benutzer standardmäßig seine eigenen To-Dos
- Er kann in eine globale Ansicht umschalten, die auch die To-Dos anderer Benutzer zeigt (im Rahmen seiner Rechte)
- Jeder Benutzer kann in seinen Einstellungen festlegen, ob das Board standardmäßig „Meine“ oder „Alle“ zeigt und welche Ansicht (nach Status, nach Personen, nach Prioritäten, nach Tags oder Raster) voreingestellt ist

### Eigene Filter und Projektnavigation

- **Eigene Filter:** Jeder Benutzer kann eigene Filter definieren, speichern und schnell wieder aufrufen. Filterkriterien: Tag, Person, Priorität und Projekt. Jedes Kriterium erlaubt Mehrfachauswahl (ODER innerhalb eines Kriteriums), Kriterien sind kombinierbar (UND zwischen Kriterien)
- **Projekt-Menüpunkt:** Projekte haben einen eigenen Menüpunkt; darüber wählt man ein Projekt und sieht dessen To-Dos

### To-Dos teilen

- Jedes To-Do hat eine eindeutige, dauerhafte Adresse (Deep Link)
- Ein kleiner Teilen-Button an jedem To-Do. Am Desktop: Link kopieren oder per E-Mail versenden. Auf Mobilgeräten: das native Teilen-Menü des Geräts (Web Share API), z. B. für WhatsApp oder andere Apps
- Der Link öffnet das To-Do nur nach Anmeldung und nur, wenn der Empfänger Zugriff darauf hat; ohne Berechtigung wird nichts über das To-Do preisgegeben (Zero Trust). Gehört das To-Do zu einem anderen Mandanten des Empfängers, wird automatisch dorthin gewechselt

### Listen-Export

- Jeder Benutzer kann die To-Dos der aktuellen Ansicht inkl. aktiver Filter als Liste exportieren, z. B. zum Versenden oder zur Weiterbearbeitung in Excel
- Formate: Excel (XLSX) und CSV
- Exportiert werden nur To-Dos, die der Benutzer sehen darf; ein Re-Import ist nicht vorgesehen

### Abgeschlossene To-Dos ausblenden

- To-Dos können jederzeit gecancelt werden, egal in welchem Status sie gerade sind
- Erledigte und gecancelte To-Dos sind standardmäßig ausgeblendet
- Ein Schalter blendet sie wieder ein

### Statusmodell

Es gibt ein Standard-Statusset, das systemweit angepasst und erweitert werden kann (keine Einstellung pro Projekt).

- **Standard-Status:** Backlog, In Arbeit, Under Review, Erledigt, Abgelehnt, Gelöscht
- **Anpassbar:** Status können vom Administrator in den Systemeinstellungen umbenannt, ergänzt und entfernt werden
  - **Reihenfolge:** Der Administrator vergibt jedem Status eine Rangfolge als Zahl; sie bestimmt die Reihenfolge der Status-Spalten
- **Farbcodierung:** Jeder Status hat eine Farbe; Kacheln zeigen diese Farbe, damit der Status auf einen Blick erkennbar ist

## 6. Datenmodell To-Do

Jedes To-Do hat folgende Felder; Anhänge sind nicht vorgesehen.

| Feld | Pflege | Hinweis |
| --- | --- | --- |
| Titel | manuell |  |
| Beschreibung | manuell | nähere Beschreibung |
| Fälligkeitsdatum | manuell |  |
| Priorität | manuell |  |
| Zugewiesene Person | manuell | eine Person oder keine; Benutzer oder Person ohne Login |
| Status | manuell | gemäß Statusmodell |
| Links / Verweise | manuell | beliebig viele |
| Tags | manuell | frei definierbar |
| Erfassungsdatum | automatisch |  |
| Änderungsdatum | automatisch | letzte Änderung |
| Letzter Änderer | automatisch |  |

Die Prioritätsstufen sind als generelle Systemeinstellung konfigurierbar, nicht pro Projekt. Der Administrator legt sie an und vergibt jeder Stufe eine Rangfolge in Form einer Zahl, nach der sortiert wird. Jeder Priorität ordnet er ein kleines Icon aus einer vorgegebenen Auswahl zu, das auf der Kachel angezeigt wird. Das Icon wird aus drei Merkmalen kombiniert: Anzahl der Pfeile (1, 2 oder 3), Richtung (nach oben oder unten) und Farbe (Grün, Gelb oder Rot). Zusätzlich steht ein rotes Ausrufezeichen zur Wahl.

## 7. Projekte und projektübergreifendes Board

To-Dos werden Projekten zugeordnet; zusätzlich gibt es ein projektübergreifendes Board.

- **Projektzuordnung:** Jedes To-Do kann einem Projekt zugeordnet werden (eigenes Feld, unabhängig von Tags)
- **Projektübergreifendes Board:** Zeigt To-Dos aller Projekte gemeinsam
- **Filter nach Projekt:** Schnelles Filtern des Boards nach einem oder mehreren Projekten
- **Globale Einstellungen:** Status und Prioritäten gelten systemweit für alle Projekte, damit das übergreifende Board einheitlich bleibt

* **To-Dos ohne Projekt:** erlaubt, z. B. für schnelle Erfassung am Handy
* **Ansicht „Ohne Projekt“:** eigene Ansicht bzw. Schnellfilter für alle To-Dos, die noch keinem Projekt zugeordnet sind

- **Projekte archivieren:** Nur Mandanten-Administrator und Projektadministrator können Projekte archivieren. Archivieren blendet das Projekt und alle seine To-Dos standardmäßig aus, löscht aber nichts. Vor dem Archivieren erscheint eine Warnung, dass auch die To-Dos archiviert werden. Archivierte Projekte lassen sich samt To-Dos wiederherstellen

## 8. Benutzerverwaltung und Rollen

Das System hat eine eigene Benutzerverwaltung mit vier Projektrollen sowie den mandantenweiten Rollen Administrator und Projektadministrator.

- **Anmeldung:** E-Mail-Adresse als Benutzername plus Passwort

| Rolle | Rechte |
| --- | --- |
| Administrator | Alles; legt systemweit Status und Prioritäten fest |
| Bearbeiter | Legt To-Dos an, bearbeitet alle To-Dos, ändert Status |
| Eingeschränkter Bearbeiter | Sieht und bearbeitet nur eigene To-Dos, keine fremden |
| Leser | Darf To-Dos nur lesen |

Dazu kommt der **Projektadministrator** als mandantenweite Rolle für die Verwaltung von Projekten. Benutzer werden nur per Einladung hinzugefügt und nie physisch gelöscht, sondern nur deaktiviert oder pseudonymisiert. Die vollständigen Anforderungen an Rollen, „eigene“ To-Dos, Personen ohne Login, Einladungen, Pseudonymisierung und Zuweisungsregeln stehen in [rollen-und-rechte.md](rollen-und-rechte.md).

## 9. Zusammenarbeit und Benachrichtigungen

Teamänderungen erscheinen live, Benachrichtigungen steuert jeder Benutzer selbst.

- **Live-Aktualisierung:** Änderungen an To-Dos erscheinen ohne Neuladen sofort bei allen Benutzern, die die betroffene Ansicht geöffnet haben
- **E-Mail-Benachrichtigung:** z. B. wenn einem Benutzer ein To-Do zugewiesen wird
- **Selbststeuerung:** Jeder Benutzer kann Benachrichtigungen in seinen Einstellungen ein- und ausschalten

* **Kommentare:** Alle Rollen, auch Leser, können die To-Dos kommentieren, die sie sehen dürfen; jeder Kommentar speichert Autor und Zeitpunkt
* **Änderungsverlauf:** Jedes To-Do hat einen Verlauf, der zeigt, wer wann welches Feld von welchem auf welchen Wert geändert hat

- **Fälligkeitserinnerung:** Jeder Benutzer kann in seinen Benutzereinstellungen einmalig festlegen, ob und wie viele Tage vor dem Fälligkeitsdatum er an seine zugewiesenen To-Dos erinnert wird. Die Einstellung gilt für alle seine To-Dos; eine Einstellung pro To-Do gibt es nicht
  - **Überfälligkeitsmeldung:** Separat ein- und ausschaltbar; benachrichtigt, wenn ein zugewiesenes To-Do überfällig wird
  - **Geltungsbereich der Benachrichtigungseinstellungen:** Alle Benachrichtigungsoptionen (neue Zuweisung, Erinnerung vor Fälligkeit inkl. Tage, Überfälligkeit) stellt der Benutzer einmalig auf Benutzerebene ein; sie gelten automatisch für alle seine Mandanten

## 10. Technische Rahmenbedingungen

Die Anwendung wird als Node.js-Web-App umgesetzt, nicht als WordPress-Plugin.

**Oberflächensprache:** umschaltbar, zunächst Deutsch und Englisch; weitere Sprachen sollen später ergänzbar sein.

- **Backend:** Node.js mit einer Schnittstelle (API), die Web- und Mobiloberfläche gemeinsam nutzen
- **Mobil:** Als Progressive Web App (PWA), auf dem Smartphone installierbar; keine separate native App
- **Datenspeicherung:** SQLite und PostgreSQL werden beide unterstützt und sind per Konfiguration umschaltbar. Umsetzung über eine datenbankunabhängige Datenschicht (z. B. ORM/Query-Builder), ohne datenbankspezifische Sonderfunktionen. Tests laufen gegen beide Datenbanken. Ein Migrationsskript überträgt Daten von SQLite nach PostgreSQL.

* **Betrieb:** Muss bei einem externen Hosting-Anbieter mit Serverstandort Deutschland kostengünstig betreibbar sein (z. B. auf einem kleinen Server)

## 11. Mehrmandantenfähigkeit

Das System ist mehrmandantenfähig: Alles in diesem Dokument gilt jeweils innerhalb eines einzelnen Mandanten. Jeder Mandant hat komplett eigenständige Datenbestände; kein Mandant sieht Daten eines anderen. Ein Systemadministrator verwaltet die Mandanten, eine Person kann mehreren Mandanten angehören, und einzelne Mandanten lassen sich exportieren und importieren. Die vollständigen Anforderungen stehen in [mandanten.md](mandanten.md).

- **Begriffe:** „Systemweit“, „global“ und „Systemeinstellung“ in den Abschnitten oben bedeuten „für den gesamten Mandanten“; der „Administrator“ ist der Administrator eines Mandanten

**Sicherheit nach Zero-Trust-Prinzip:** Keiner Anfrage wird vertraut, auch nicht von angemeldeten Benutzern. Jede Anfrage wird serverseitig auf Anmeldung, Mandantenzugehörigkeit, Projektrolle und Objektzugriff geprüft. Mandanten-IDs und Objekt-IDs aus der Anfrage werden nie ungeprüft übernommen. Ein Zugriff auf Daten eines fremden Mandanten darf unter keinen Umständen möglich sein.

## 12. Annahmen und Standardwerte

- Nur der Administrator ändert Status, Prioritäten, deren Farben und Rangfolge.
- Standard-Prioritäten bei Erstinstallation: Kritisch, Hoch, Mittel, Niedrig (Rangfolge 1 bis 4, 1 = höchste).
- Einladungslinks sind 7 Tage gültig und nur einmal nutzbar. Es gibt eine Passwort-vergessen-Funktion per E-Mail-Link.
- Der erste Systemadministrator wird bei der Installation per Setup-Skript oder Konfiguration angelegt.

## 13. Hinweise für den KI-Agenten

Setze die Anwendung vollständig nach diesem Dokument um; bei Unklarheiten gelten die Annahmen aus Abschnitt 12.

- **Mandantentrennung:** Jede Datenbankabfrage ist auf den aktiven Mandanten beschränkt; automatisierte Tests prüfen, dass keine Daten zwischen Mandanten sichtbar werden

* **Rechte serverseitig prüfen:** Jede Aktion wird im Backend gegen Rolle und Projekt geprüft, nicht nur in der Oberfläche
* **Sicherheit:** Passwörter gehasht speichern (z. B. bcrypt/argon2), sichere Sessions, Schutz gegen gängige Web-Angriffe
* **Responsive:** Web-Oberfläche für Desktop, vereinfachte Schnellerfassung für Mobil (PWA)
* **Mehrsprachigkeit:** Alle Texte über Übersetzungsdateien, keine fest codierten Texte
* **Tests:** Automatisierte Tests für Rechte, Filter und Datenbankumschaltung (SQLite und PostgreSQL)
* **Lieferumfang:** Quellcode, README mit Installation und Konfiguration, Setup-Skript, Migrationsskript SQLite → PostgreSQL

## 14. Präzisierungen und Entscheidungen

Ergänzend zu den Abschnitten oben gelten folgende, mit dem Auftraggeber abgestimmte Festlegungen. Präzisierungen zu Rollen und Zuweisung stehen in [rollen-und-rechte.md](rollen-und-rechte.md), zu Mandanten, Benutzern und Export/Import von Mandanten in [mandanten.md](mandanten.md), zu Mobil und Offline in [mobile-offline.md](mobile-offline.md).

### Statusmodell

- Jeder Status hat eine **Kategorie**: offen, erledigt oder abgebrochen. Standard: Backlog, In Arbeit, Under Review = offen; Erledigt = erledigt; Abgelehnt, Gelöscht = abgebrochen
- To-Dos mit einem Status der Kategorie „erledigt“ oder „abgebrochen“ sind standardmäßig ausgeblendet
- **Canceln** setzt den Status, den der Administrator als Abbruch-Status markiert hat (Standard: „Abgelehnt“)
- Ein Status ist als Standard für neue To-Dos markiert (Standard: „Backlog“)
- Standard-Status und -Prioritäten werden in der jeweiligen Oberflächensprache angezeigt, bis der Administrator sie umbenennt
- Entfernte Status und Prioritäten werden nur ausgeblendet; betroffene To-Dos erhalten beim Entfernen einen Ersatzwert
- Das Prioritäts-Icon wird über eine einzige Auswahlliste gewählt, die alle Icons als Tabelle zeigt: Zeilen = Anzahl und Richtung der Pfeile (3, 2, 1 nach oben, 1, 2, 3 nach unten), Spalten = Farbe (Grün, Gelb, Rot), dazu eine eigene Zeile für das rote Ausrufezeichen

### Tags, Links und Beschreibung

- Tags entstehen beim Bearbeiten eines To-Dos (jeder mit Bearbeitungsrecht); umbenennen, einfärben und löschen darf nur der Administrator. Ein gelöschter Tag wird von allen To-Dos entfernt
- Links in To-Dos sind auf `http://`, `https://` und `mailto:` beschränkt
- Links lassen sich direkt von der Kachel aus öffnen, ohne das To-Do zu öffnen: Ein Link-Symbol zeigt die Anzahl der Links; bei einem Link öffnet es ihn sofort, bei mehreren erscheint eine Auswahl. Im Dialog hat jeder Link eine Schaltfläche zum Öffnen; wer nur lesen darf, sieht die Links als anklickbare Verweise. Web-Links öffnen sich in einem neuen Tab ohne Zugriff auf das Board, `mailto:`-Links im E-Mail-Programm
- Die Beschreibung eines To-Dos ist reiner Text

### Drag and Drop

- Ansicht nach Status setzt den Status, Ansicht nach Personen setzt die Zuweisung, Ansicht nach Prioritäten setzt die Priorität, die Raster-Ansicht setzt Status und Zuweisung
- In der Ansicht nach Tags ist kein Drag and Drop möglich
- Auf Touch-Geräten startet das Ziehen nach kurzem Gedrückthalten einer Kachel, damit normales Scrollen möglich bleibt

### Board, Filter und Sortierung

- „Meine“ zeigt die dem Benutzer zugewiesenen To-Dos, „Alle“ alle To-Dos, die er sehen darf
- Standardanzeige („Meine“/„Alle“) und Standardansicht sind persönliche Einstellungen des Benutzers und gelten für alle seine Mandanten; ohne Einstellung gelten „Meine“ und „Nach Status“. Sie greifen, wenn das Board ohne Angabe von Anzeige bzw. Ansicht in der Adresse geöffnet wird; sobald auf dem Board etwas umgeschaltet wird, stehen Anzeige und Ansicht ausdrücklich in der Adresse, damit Lesezeichen und geteilte Links unabhängig von den persönlichen Einstellungen sind
- Ansicht nach Personen und Raster-Ansicht zeigen eine Zeile bzw. Lane je Person mit To-Dos (bzw. je gefilterter Person) sowie „Nicht zugewiesen“; in der Ansicht nach Prioritäten gibt es eine Lane je Priorität in der Rangfolge (bzw. je gefilterter Priorität) sowie „Keine Priorität“; in der Ansicht nach Tags erscheint ein To-Do mit mehreren Tags in mehreren Lanes, To-Dos ohne Tag in „Ohne Tag“
- Filter bieten je Kriterium auch „ohne“ (ohne Tag, nicht zugewiesen, ohne Priorität, ohne Projekt)
- Gespeicherte Filter speichern die Filterkriterien (Tag, Person, Priorität, Projekt), nicht Ansicht, Suche oder Sortierung
- Sortierung „aufsteigend“ nach Priorität bedeutet: höchste Priorität (Rang 1) zuerst. Leere Werte (keine Priorität, kein Fälligkeitsdatum) stehen immer am Ende
- Ansicht, Filter und Sortierung stehen in der Adresse der Seite und können als Lesezeichen gespeichert werden

### Teilen und Export

- Der Deep Link eines To-Dos hat die Form `<BASE_URL>/todos/<ID>`
- Export-Spalten: Titel, Beschreibung, Projekt, Status, Priorität, Zuständig, Fällig am, Tags, Links, Erfasst am/von, Geändert am/von, Link zum To-Do; Spaltenüberschriften in der Sprache des Benutzers
- CSV wird als UTF-8 mit BOM erzeugt, mit Semikolon als Trennzeichen bei deutscher und Komma bei englischer Oberfläche. Zellen, die mit `=`, `+`, `-` oder `@` beginnen, werden in CSV mit einem Apostroph geschützt (Formel-Injection)

### Live-Aktualisierung und Benachrichtigungen

- Ereignisse an Clients enthalten nur IDs. Eine To-Do-ID erhält nur, wer das To-Do sehen darf; alle anderen Mitglieder des Mandanten erfahren nur, dass sich To-Dos geändert haben, und laden ihre Ansicht neu. Nach Abmelden oder Deaktivieren werden keine Ereignisse mehr zugestellt
- Ist ein To-Do im Dialog geöffnet und wird es woanders geändert, lädt der Dialog die neuen Werte, sofern keine ungespeicherten Eingaben vorliegen; andernfalls erscheint ein Hinweis und die Eingaben bleiben erhalten
- Zuweisungs-E-Mails gehen an die neu zugewiesene Person (nicht bei Selbstzuweisung), in ihrer Sprache
- Erinnerungen und Überfälligkeitsmeldungen werden je To-Do, Person und Fälligkeitsdatum genau einmal versendet; ändert sich das Fälligkeitsdatum, wird erneut erinnert. Alle fälligen To-Dos einer Person werden in einer E-Mail zusammengefasst
- Berücksichtigt werden nur offene To-Dos mit aktiver Zuweisung außerhalb archivierter Projekte. „0 Tage vorher“ bedeutet Erinnerung am Fälligkeitstag
- Die Prüfung läuft periodisch (Standard: stündlich) in der Zeitzone der Installation (Standard: Europe/Berlin)

### Datenbankwechsel

- Die Migration SQLite → PostgreSQL kopiert alle Tabellen in einer Transaktion in eine leere Zieldatenbank und prüft die Anzahl der Datensätze je Tabelle; Sitzungen bleiben erhalten

### Technik

- Backend: Node.js mit Fastify und TypeScript; Datenzugriff über den Query-Builder Knex
- Oberfläche: Vue 3 mit TypeScript (Single-Page-App und PWA)
- Live-Aktualisierung über Server-Sent Events; Ereignisse enthalten nur IDs, Inhalte werden über die rechtegeprüfte API nachgeladen
- E-Mail-Versand über SMTP; für Tests kann der Versand ins Server-Log umgeleitet werden
- Zeitstempel werden in UTC gespeichert, Fälligkeitsdaten als Kalenderdatum; Erinnerungen werden stündlich geprüft

## 15. Ergänzende Anforderungsdokumente

Die folgenden Dokumente im Verzeichnis `documentation` beschreiben einzelne Anforderungsbereiche ausführlich. Die Festlegungen dieses Dokuments gelten dort weiter; Abweichungen werden im jeweiligen Dokument ausdrücklich genannt.

| Dokument | Inhalt | Status |
| --- | --- | --- |
| [rollen-und-rechte.md](rollen-und-rechte.md) | Benutzer, Rollen, Personen ohne Login, Einladung, Pseudonymisierung, Zuweisungsregeln (zu §8) | umgesetzt |
| [mandanten.md](mandanten.md) | Mehrmandantenfähigkeit, Personen in mehreren Mandanten, Export und Import von Mandanten (zu §11) | umgesetzt |
| [mobile-offline.md](mobile-offline.md) | PWA, Schnellerfassung, Offline-Betrieb und Synchronisation (zu §3, §5, §10) | umgesetzt |
| [mcp-server.md](mcp-server.md) | MCP-Server für KI-Assistenten: Anlegen, Aktualisieren und Überwachen von To-Dos, Zugriffstokens | umgesetzt (Phase 1) |
