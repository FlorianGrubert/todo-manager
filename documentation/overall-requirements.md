# Anforderungsdefinition: To-Do-Manager-App

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

## 5. Ansichten, Swimlanes und Tags

Mehrere umschaltbare Ansichten, besonders für komplexe Themen und größere Teams.

- **Swimlanes nach Status:** z. B. offen, in Arbeit, erledigt
- **Swimlanes nach Personen:** je zuständiger Person eine Lane
- **Tags:** To-Dos lassen sich mit frei definierbaren Themen-Tags versehen
- **Ansichten nach Tags:** Swimlanes bzw. Ansichten je Themenbereich (Tag) erzeugen
- **Filter:** Schnelles Filtern und Suchen von To-Dos nach Tags/Themen

### Offline-Fähigkeit (Mobil)

- Die mobile Schnellerfassung funktioniert auch ohne Netzverbindung
- Offline erfasste To-Dos werden lokal gespeichert und automatisch synchronisiert, sobald wieder eine Verbindung besteht

* Bestehende To-Dos sind offline aus dem lokalen Zwischenspeicher sichtbar, aber schreibgeschützt; offline sind nur neue To-Dos erfassbar
* Die App zeigt deutlich an, dass sie offline ist

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
- Verschieben ist nur möglich, wenn die Rolle des Benutzers die Änderung erlaubt

### Startansicht

- Nach dem Anmelden sieht der Benutzer standardmäßig seine eigenen To-Dos
- Er kann in eine globale Ansicht umschalten, die auch die To-Dos anderer Benutzer zeigt (im Rahmen seiner Rechte)

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
| Zugewiesene Person | manuell | eine Person oder keine |
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

**Projektadministrator (fünfte Rolle):** Gilt für den gesamten Mandanten, nicht pro Projekt. Darf neue Projekte anlegen, Projekte archivieren und wiederherstellen sowie Benutzer Projekten zuordnen und ihre Projektrolle festlegen. Darf keine Benutzer einladen und keine Status, Prioritäten oder Mandanteneinstellungen ändern. Der Mandanten-Administrator hat alle Rechte des Projektadministrators.

**„Eigene“ To-Dos beim eingeschränkten Bearbeiter:** alle To-Dos, die der Person zugewiesen sind, plus selbst angelegte To-Dos, solange ihnen noch niemand zugewiesen ist.

**Geltungsbereich der Rollen:** Der Administrator ist eine globale, projektunabhängige Rolle. Bearbeiter, eingeschränkter Bearbeiter und Leser werden pro Projekt vergeben; eine Person kann in verschiedenen Projekten verschiedene Rollen haben. Für To-Dos ohne Projekt gilt eine Standardrolle, die der Administrator pro Benutzer festlegt.

**Benutzer einladen:** Nur der Administrator kann neue Benutzer hinzufügen, und zwar ausschließlich per Einladung (kein direktes Anlegen). Die eingeladene Person erhält eine E-Mail mit Link und legt darüber ihr Passwort selbst fest.

**Letzter Login:** Datum und Uhrzeit des letzten Logins werden je Benutzer automatisch gespeichert. Administratoren sehen den Wert in der Benutzerübersicht; Benutzer, die sich noch nie angemeldet haben, sind als „nie angemeldet“ erkennbar.

**Kein endgültiges Löschen:** Benutzerdatensätze und To-Dos werden nie physisch gelöscht, damit die vollständige Historie erhalten bleibt. Benutzer werden nur deaktiviert; deaktivierte Benutzer können sich nicht mehr anmelden. Zusätzlich kann ein Benutzer pseudonymisiert werden: Seine persönlichen Daten (Name, E-Mail) werden durch ein Pseudonym ersetzt, Verweise in To-Dos, Kommentaren und Verlauf bleiben erhalten. Der Status „Gelöscht“ bei To-Dos ist ebenfalls nur ein Status.

**Pseudonymisierung und Einladung bei mehreren Mandanten:**

- Pseudonymisieren darf der Mandanten-Administrator; es betrifft immer nur die Mitgliedschaft im eigenen Mandanten
- Es wird nie etwas mandantenübergreifend geändert
- Der Mandanten-Administrator darf nicht erkennen können, ob eine Person schon in anderen Mandanten existiert. Einladungsablauf und Rückmeldungen sind für ihn in beiden Fällen identisch
- Intern erkennt das System eine bereits bekannte E-Mail-Adresse und legt keinen neuen Benutzer an, sondern nur eine weitere Mandantenmitgliedschaft; die Person nimmt die Einladung mit ihrem bestehenden Login an

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

Das System ist mehrmandantenfähig: Alles in diesem Dokument gilt jeweils innerhalb eines einzelnen Mandanten.

- **Vollständige Trennung:** Jeder Mandant hat komplett eigenständige Datenbestände: Benutzer, Projekte, To-Dos, Tags, Status, Prioritäten, Filter und Einstellungen. Kein Mandant sieht Daten eines anderen
- **Systemadministrator:** Eigene, mandantenübergreifende Rolle oberhalb aller Mandanten. Legt neue Mandanten an und verwaltet sie
- **Mandanten-Administrator:** Die bisher beschriebene Rolle „Administrator“ ist der Administrator eines Mandanten
- **Begriffe:** „Systemweit“, „global“ und „Systemeinstellung“ in den Abschnitten oben bedeuten „für den gesamten Mandanten“
- **Neuer Mandant:** Jeder neue Mandant startet mit den Standard-Status und Standard-Prioritäten. Beim Anlegen lädt der Systemadministrator automatisch den ersten Mandanten-Administrator ein
  - **Mindestens ein Admin:** Das System stellt sicher, dass jeder Mandant immer mindestens einen aktiven Administrator hat; der letzte aktive Admin kann weder entfernt, deaktiviert noch herabgestuft werden

**Personen in mehreren Mandanten:** Eine Person (E-Mail-Adresse) kann mehreren Mandanten angehören. Sie hat ein Login (E-Mail + Passwort); Rollen, Standardrolle, Filter und Einstellungen gelten je Mandant. Nach der Anmeldung sieht sie nur einen Mandanten, standardmäßig den zuletzt genutzten, und kann über einen Umschalter in der Oberfläche zwischen ihren Mandanten wechseln. Alle anderen Daten bleiben strikt pro Mandant getrennt.

**Sicherheit nach Zero-Trust-Prinzip:** Keiner Anfrage wird vertraut, auch nicht von angemeldeten Benutzern. Jede Anfrage wird serverseitig auf Anmeldung, Mandantenzugehörigkeit, Projektrolle und Objektzugriff geprüft. Mandanten-IDs und Objekt-IDs aus der Anfrage werden nie ungeprüft übernommen. Ein Zugriff auf Daten eines fremden Mandanten darf unter keinen Umständen möglich sein.

**Export und Import pro Mandant:** Der Systemadministrator kann einen einzelnen Mandanten vollständig exportieren (alle Daten inkl. Verlauf, maschinenlesbares Format wie JSON) und wieder importieren, ohne andere Mandanten zu beeinflussen. Der Import kann in einen neuen Mandanten erfolgen oder einen bestehenden Mandanten nach Warnung und Bestätigung ersetzen. Die regelmäßige Datensicherung erfolgt außerhalb der Anwendung auf Ebene der Datenbank bzw. des Hostings.

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

Ergänzend zu den Abschnitten oben gelten folgende, mit dem Auftraggeber abgestimmte Festlegungen.

### Statusmodell

- Jeder Status hat eine **Kategorie**: offen, erledigt oder abgebrochen. Standard: Backlog, In Arbeit, Under Review = offen; Erledigt = erledigt; Abgelehnt, Gelöscht = abgebrochen
- To-Dos mit einem Status der Kategorie „erledigt“ oder „abgebrochen“ sind standardmäßig ausgeblendet
- **Canceln** setzt den Status, den der Administrator als Abbruch-Status markiert hat (Standard: „Abgelehnt“)
- Ein Status ist als Standard für neue To-Dos markiert (Standard: „Backlog“)
- Standard-Status und -Prioritäten werden in der jeweiligen Oberflächensprache angezeigt, bis der Administrator sie umbenennt
- Entfernte Status und Prioritäten werden nur ausgeblendet; betroffene To-Dos erhalten beim Entfernen einen Ersatzwert

### Rollen und Zuweisung

- Der eingeschränkte Bearbeiter darf To-Dos anlegen und nur sich selbst oder niemanden zuweisen
- Zugewiesen werden kann nur, wer im Projekt des To-Dos mindestens eingeschränkter Bearbeiter ist (bei To-Dos ohne Projekt: entsprechende Standardrolle)
- Der Projektadministrator hat keine automatischen Rechte an To-Dos; dafür gelten nur seine Projektrollen. Der Mandanten-Administrator hat überall alle Rechte
- Benutzer sehen nur Projekte, in denen sie eine Rolle haben; Projektadministratoren und Mandanten-Administratoren sehen alle Projekte
- Projekte und To-Dos, auf die ein Benutzer keinen Zugriff hat, werden wie nicht vorhanden behandelt (Antwort „nicht gefunden“)
- To-Dos archivierter Projekte sind schreibgeschützt, bis das Projekt wiederhergestellt ist
- Tags entstehen beim Bearbeiten eines To-Dos (jeder mit Bearbeitungsrecht); umbenennen, einfärben und löschen darf nur der Administrator. Ein gelöschter Tag wird von allen To-Dos entfernt
- Links in To-Dos sind auf `http://`, `https://` und `mailto:` beschränkt
- Die Beschreibung eines To-Dos ist reiner Text

### Drag and Drop

- Ansicht nach Status setzt den Status, Ansicht nach Personen setzt die Zuweisung, die Raster-Ansicht setzt beides
- In der Ansicht nach Tags ist kein Drag and Drop möglich
- Auf Touch-Geräten startet das Ziehen nach kurzem Gedrückthalten einer Kachel, damit normales Scrollen möglich bleibt

### Board, Filter und Sortierung

- „Meine“ zeigt die dem Benutzer zugewiesenen To-Dos (Startansicht), „Alle“ alle To-Dos, die er sehen darf
- Ansicht nach Personen und Raster-Ansicht zeigen eine Zeile bzw. Lane je Person mit To-Dos (bzw. je gefilterter Person) sowie „Nicht zugewiesen“; in der Ansicht nach Tags erscheint ein To-Do mit mehreren Tags in mehreren Lanes, To-Dos ohne Tag in „Ohne Tag“
- Filter bieten je Kriterium auch „ohne“ (ohne Tag, nicht zugewiesen, ohne Priorität, ohne Projekt)
- Gespeicherte Filter speichern die Filterkriterien (Tag, Person, Priorität, Projekt), nicht Ansicht, Suche oder Sortierung
- Sortierung „aufsteigend“ nach Priorität bedeutet: höchste Priorität (Rang 1) zuerst. Leere Werte (keine Priorität, kein Fälligkeitsdatum) stehen immer am Ende
- Ansicht, Filter und Sortierung stehen in der Adresse der Seite und können als Lesezeichen gespeichert werden

### Teilen und Export

- Der Deep Link eines To-Dos hat die Form `<BASE_URL>/todos/<ID>`
- Export-Spalten: Titel, Beschreibung, Projekt, Status, Priorität, Zuständig, Fällig am, Tags, Links, Erfasst am/von, Geändert am/von, Link zum To-Do; Spaltenüberschriften in der Sprache des Benutzers
- CSV wird als UTF-8 mit BOM erzeugt, mit Semikolon als Trennzeichen bei deutscher und Komma bei englischer Oberfläche. Zellen, die mit `=`, `+`, `-` oder `@` beginnen, werden in CSV mit einem Apostroph geschützt (Formel-Injection)

### Mandanten und Benutzer

- Letzter Login, Deaktivierung und Pseudonymisierung gelten je Mandantenmitgliedschaft; dadurch ist für einen Mandanten-Administrator nicht erkennbar, ob eine Person anderen Mandanten angehört
- Der Anzeigename einer Person wird je Mandant geführt (beim Einladen vom Administrator vergeben)
- Pseudonymisieren ersetzt den Anzeigenamen durch ein Pseudonym, blendet die E-Mail-Adresse im Mandanten aus und deaktiviert die Mitgliedschaft; das ist endgültig. Gehört die Person keinem anderen Mandanten an (und ist kein Systemadministrator), werden auch Name und E-Mail des Kontos anonymisiert und die Anmeldung gesperrt
- Noch nicht angenommene Einladungen können erneut versendet werden; der alte Link wird dabei ungültig
- Passwörter haben mindestens 10 Zeichen; Links zum Zurücksetzen des Passworts sind 1 Stunde gültig
- Nach dem Zurücksetzen des Passworts werden alle Sitzungen des Benutzers beendet

### Live-Aktualisierung und Benachrichtigungen

- Ereignisse an Clients enthalten nur IDs. Eine To-Do-ID erhält nur, wer das To-Do sehen darf; alle anderen Mitglieder des Mandanten erfahren nur, dass sich To-Dos geändert haben, und laden ihre Ansicht neu. Nach Abmelden oder Deaktivieren werden keine Ereignisse mehr zugestellt
- Ist ein To-Do im Dialog geöffnet und wird es woanders geändert, lädt der Dialog die neuen Werte, sofern keine ungespeicherten Eingaben vorliegen; andernfalls erscheint ein Hinweis und die Eingaben bleiben erhalten
- Zuweisungs-E-Mails gehen an die neu zugewiesene Person (nicht bei Selbstzuweisung), in ihrer Sprache
- Erinnerungen und Überfälligkeitsmeldungen werden je To-Do, Person und Fälligkeitsdatum genau einmal versendet; ändert sich das Fälligkeitsdatum, wird erneut erinnert. Alle fälligen To-Dos einer Person werden in einer E-Mail zusammengefasst
- Berücksichtigt werden nur offene To-Dos mit aktiver Zuweisung außerhalb archivierter Projekte. „0 Tage vorher“ bedeutet Erinnerung am Fälligkeitstag
- Die Prüfung läuft periodisch (Standard: stündlich) in der Zeitzone der Installation (Standard: Europe/Berlin)

### Technik

- Backend: Node.js mit Fastify und TypeScript; Datenzugriff über den Query-Builder Knex
- Oberfläche: Vue 3 mit TypeScript (Single-Page-App und PWA)
- Live-Aktualisierung über Server-Sent Events; Ereignisse enthalten nur IDs, Inhalte werden über die rechtegeprüfte API nachgeladen
- E-Mail-Versand über SMTP; für Tests kann der Versand ins Server-Log umgeleitet werden
- Zeitstempel werden in UTC gespeichert, Fälligkeitsdaten als Kalenderdatum; Erinnerungen werden stündlich geprüft
