# Anforderungsdefinition: Mandanten, Export/Import

Dieses Dokument ergänzt die [Anforderungsdefinition](overall-requirements.md) (§11). Das Sicherheitsprinzip Zero Trust und die Begriffsregel „systemweit = für den gesamten Mandanten“ stehen dort in §11. Rollen innerhalb eines Mandanten beschreibt [rollen-und-rechte.md](rollen-und-rechte.md). Abschnittsverweise der Form „§n“ beziehen sich auf die Anforderungsdefinition.

## 1. Mehrmandantenfähigkeit

Das System ist mehrmandantenfähig: Alles in der Anforderungsdefinition gilt jeweils innerhalb eines einzelnen Mandanten.

- **Vollständige Trennung:** Jeder Mandant hat komplett eigenständige Datenbestände: Benutzer, Projekte, To-Dos, Tags, Status, Prioritäten, Filter und Einstellungen. Kein Mandant sieht Daten eines anderen
- **Systemadministrator:** Eigene, mandantenübergreifende Rolle oberhalb aller Mandanten. Legt neue Mandanten an und verwaltet sie
- **Mandanten-Administrator:** Die Rolle „Administrator“ (siehe [rollen-und-rechte.md](rollen-und-rechte.md)) ist der Administrator eines Mandanten
- **Neuer Mandant:** Jeder neue Mandant startet mit den Standard-Status und Standard-Prioritäten. Beim Anlegen lädt der Systemadministrator automatisch den ersten Mandanten-Administrator ein
  - **Mindestens ein Admin:** Das System stellt sicher, dass jeder Mandant immer mindestens einen aktiven Administrator hat; der letzte aktive Admin kann weder entfernt, deaktiviert noch herabgestuft werden

**Personen in mehreren Mandanten:** Eine Person (E-Mail-Adresse) kann mehreren Mandanten angehören. Sie hat ein Login (E-Mail + Passwort); Rollen, Standardrolle, Filter und Einstellungen gelten je Mandant. Nach der Anmeldung sieht sie nur einen Mandanten, standardmäßig den zuletzt genutzten, und kann über einen Umschalter in der Oberfläche zwischen ihren Mandanten wechseln. Alle anderen Daten bleiben strikt pro Mandant getrennt.

**Export und Import pro Mandant:** Der Systemadministrator kann einen einzelnen Mandanten vollständig exportieren (alle Daten inkl. Verlauf, maschinenlesbares Format wie JSON) und wieder importieren, ohne andere Mandanten zu beeinflussen. Der Import kann in einen neuen Mandanten erfolgen oder einen bestehenden Mandanten nach Warnung und Bestätigung ersetzen. Die regelmäßige Datensicherung erfolgt außerhalb der Anwendung auf Ebene der Datenbank bzw. des Hostings.

## 2. Präzisierungen: Mandanten und Benutzer

- Letzter Login, Deaktivierung und Pseudonymisierung gelten je Mandantenmitgliedschaft; dadurch ist für einen Mandanten-Administrator nicht erkennbar, ob eine Person anderen Mandanten angehört
- Der Anzeigename einer Person wird je Mandant geführt (beim Einladen vom Administrator vergeben)
- Pseudonymisieren ersetzt den Anzeigenamen durch ein Pseudonym, blendet die E-Mail-Adresse im Mandanten aus und deaktiviert die Mitgliedschaft; das ist endgültig. Gehört die Person keinem anderen Mandanten an (und ist kein Systemadministrator), werden auch Name und E-Mail des Kontos anonymisiert und die Anmeldung gesperrt
- Noch nicht angenommene Einladungen können erneut versendet werden; der alte Link wird dabei ungültig
- Passwörter haben mindestens 10 Zeichen; Links zum Zurücksetzen des Passworts sind 1 Stunde gültig
- Nach dem Zurücksetzen des Passworts werden alle Sitzungen des Benutzers beendet

## 3. Präzisierungen: Export und Import von Mandanten

- Der Mandanten-Export ist eine JSON-Datei mit allen Daten des Mandanten inkl. Kommentaren, Verlauf, gespeicherten Filtern und Personen ohne Login (ohne E-Mail-Adresse). Exporte älterer Formatversionen bleiben importierbar. Passwörter, Sitzungen und offene Einladungen sind nicht enthalten; pseudonymisierte Personen werden ohne Name und E-Mail exportiert
- Beim Import werden alle IDs neu vergeben (auch Verweise im Verlauf und in gespeicherten Filtern), sodass ein Mandant neben seinem Original oder in einer anderen Installation importiert werden kann. Personen werden über die E-Mail-Adresse einem vorhandenen Konto zugeordnet, bestehende Konten werden nicht verändert; neue Konten haben kein Passwort und werden über „Passwort vergessen“ aktiviert
- „Passwort vergessen“ funktioniert daher für alle aktiven Konten, auch ohne bisheriges Passwort
- Ersetzen eines Mandanten erfordert die Eingabe des exakten Mandantennamens; die bisherigen Daten des Mandanten werden dabei entfernt. Ungültige oder in sich widersprüchliche Dateien werden vollständig abgelehnt, ohne etwas zu ändern
