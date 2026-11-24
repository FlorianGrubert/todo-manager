# Anforderungsdefinition: Benutzer, Rollen und Rechte

Dieses Dokument ergänzt die [Anforderungsdefinition](overall-requirements.md) (§8). Alles hier gilt innerhalb eines einzelnen Mandanten; mandantenübergreifende Regeln stehen in [mandanten.md](mandanten.md). Abschnittsverweise der Form „§n“ beziehen sich auf die Anforderungsdefinition.

## 1. Benutzerverwaltung und Rollen

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

**Personen ohne Login:** To-Dos können auch Personen zugewiesen werden, die kein Benutzerkonto haben (z. B. externe Ansprechpartner). Eine solche Person besteht nur aus einem Namen, gilt für den ganzen Mandanten und wird einem oder mehreren Projekten zugeordnet. Sie kann sich nicht anmelden, hat keine Rechte und erhält keine E-Mails. Anlegen, umbenennen, deaktivieren und Projekten zuordnen dürfen Mandanten-Administrator und Projektadministrator. Wird eine Person später Benutzer, behält sie alle ihr zugewiesenen To-Dos.

**Benutzer einladen:** Nur der Administrator kann neue Benutzer hinzufügen, und zwar ausschließlich per Einladung (kein direktes Anlegen). Die eingeladene Person erhält eine E-Mail mit Link und legt darüber ihr Passwort selbst fest.

**Letzter Login:** Datum und Uhrzeit des letzten Logins werden je Benutzer automatisch gespeichert. Administratoren sehen den Wert in der Benutzerübersicht; Benutzer, die sich noch nie angemeldet haben, sind als „nie angemeldet“ erkennbar.

**Kein endgültiges Löschen:** Benutzerdatensätze und To-Dos werden nie physisch gelöscht, damit die vollständige Historie erhalten bleibt. Benutzer werden nur deaktiviert; deaktivierte Benutzer können sich nicht mehr anmelden. Zusätzlich kann ein Benutzer pseudonymisiert werden: Seine persönlichen Daten (Name, E-Mail) werden durch ein Pseudonym ersetzt, Verweise in To-Dos, Kommentaren und Verlauf bleiben erhalten. Der Status „Gelöscht“ bei To-Dos ist ebenfalls nur ein Status.

**Pseudonymisierung und Einladung bei mehreren Mandanten:**

- Pseudonymisieren darf der Mandanten-Administrator; es betrifft immer nur die Mitgliedschaft im eigenen Mandanten
- Es wird nie etwas mandantenübergreifend geändert
- Der Mandanten-Administrator darf nicht erkennen können, ob eine Person schon in anderen Mandanten existiert. Einladungsablauf und Rückmeldungen sind für ihn in beiden Fällen identisch
- Intern erkennt das System eine bereits bekannte E-Mail-Adresse und legt keinen neuen Benutzer an, sondern nur eine weitere Mandantenmitgliedschaft; die Person nimmt die Einladung mit ihrem bestehenden Login an

## 2. Präzisierungen: Rollen und Zuweisung

- Der eingeschränkte Bearbeiter darf To-Dos anlegen und nur sich selbst oder niemanden zuweisen
- Zugewiesen werden kann nur, wer im Projekt des To-Dos mindestens eingeschränkter Bearbeiter ist (bei To-Dos ohne Projekt: entsprechende Standardrolle), sowie Personen ohne Login, die dem Projekt des To-Dos zugeordnet sind. To-Dos ohne Projekt können Personen ohne Login nicht zugewiesen werden
- Personen ohne Login sind technisch Mandantenmitgliedschaften ohne Login; die Zuordnung zu einem Projekt gewährt keine Rechte. Deaktivierte Personen sind nicht mehr zuweisbar, bestehende Zuweisungen bleiben erhalten
- Eine Person ohne Login wird Benutzer, indem der Mandanten-Administrator sie mit ihrer E-Mail-Adresse einlädt (gleicher Ablauf wie beim Einladen, auch bei bereits in anderen Mandanten bekannter Adresse). Die Mitgliedschaft bleibt dieselbe, daher bleiben Zuweisungen, Verlauf und Filter erhalten. Bis zum Annehmen bleibt sie zuweisbar; mit dem Annehmen wird sie in allen zugeordneten Projekten eingeschränkter Bearbeiter. Gehört die E-Mail-Adresse bereits einem Mitglied des Mandanten, wird die Einladung abgelehnt
- Der Projektadministrator hat keine automatischen Rechte an To-Dos; dafür gelten nur seine Projektrollen. Der Mandanten-Administrator hat überall alle Rechte
- Benutzer sehen nur Projekte, in denen sie eine Rolle haben; Projektadministratoren und Mandanten-Administratoren sehen alle Projekte
- Projekte und To-Dos, auf die ein Benutzer keinen Zugriff hat, werden wie nicht vorhanden behandelt (Antwort „nicht gefunden“)
- To-Dos archivierter Projekte sind schreibgeschützt, bis das Projekt wiederhergestellt ist
