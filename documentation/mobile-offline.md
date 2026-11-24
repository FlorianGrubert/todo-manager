# Anforderungsdefinition: Mobil und Offline

Dieses Dokument ergänzt die [Anforderungsdefinition](overall-requirements.md) (§3 Plattformen, §5 Offline-Fähigkeit, §10 PWA). Abschnittsverweise der Form „§n“ beziehen sich auf die Anforderungsdefinition.

## 1. Offline-Fähigkeit

- Die mobile Schnellerfassung funktioniert auch ohne Netzverbindung
- Offline erfasste To-Dos werden lokal gespeichert und automatisch synchronisiert, sobald wieder eine Verbindung besteht

* Bestehende To-Dos sind offline aus dem lokalen Zwischenspeicher sichtbar, aber schreibgeschützt; offline sind nur neue To-Dos erfassbar
* Die App zeigt deutlich an, dass sie offline ist

## 2. Präzisierungen: Mobil und Offline

- Die installierte App (PWA) startet in der Schnellerfassung; von dort ist das Board einen Tipp entfernt. Auf dem Smartphone öffnet ein „+“-Button auf dem Board die Schnellerfassung
- Schnellerfassung: nur der Titel ist Pflicht; Beschreibung, Projekt, Priorität und Fälligkeit sind optional aufklappbar. Schnell erfasste To-Dos werden der erfassenden Person zugewiesen, damit sie in „Meine“ erscheinen
- Jedes schnell erfasste To-Do wird zuerst auf dem Gerät gespeichert und dann übertragen (online sofort, sonst automatisch bei Verbindung). Eine Geräte-ID verhindert doppelte Anlage bei Wiederholungen
- Offline erfasste To-Dos werden nur in den Mandanten übertragen, in dem sie erfasst wurden; der Server lehnt eine Übertragung in einen anderen Mandanten ab. Lehnt der Server ein To-Do ab (z. B. fehlende Rechte), bleibt es mit Hinweis in der Liste „Noch nicht übertragen“ und kann erneut gesendet oder verworfen werden
- Offline zeigt das Board den zuletzt geladenen Stand der jeweiligen Ansicht (schreibgeschützt, mit Zeitstempel); liegt für die Ansicht kein Stand vor, wird der zuletzt geladene Stand auf dem Gerät gefiltert. Kommentare und Verlauf sind offline nicht verfügbar
- Beim Abmelden werden alle auf dem Gerät gespeicherten Daten gelöscht (das Gerät kann geteilt sein); nicht übertragene To-Dos werden vorher mit Rückfrage angezeigt
- Installation und Offline-Betrieb setzen HTTPS voraus (Service Worker)
