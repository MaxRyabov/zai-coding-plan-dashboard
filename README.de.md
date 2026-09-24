<div align="center">

**[English](README.md)** | **[简体中文](README.zh-CN.md)** | **[日本語](README.ja.md)** | **[한국어](README.ko.md)** | **[Español](README.es.md)** | **[Français](README.fr.md)** | **[Deutsch](README.de.md)**

<p>

# Z.AI Usage Dashboard

Ein modernes Next.js-Dashboard zur Überwachung der Z.AI-API-Nutzung mit Echtzeitanalysen und mehrsprachiger Unterstützung.

</div>

## Funktionen

- **📈 Echtzeitnutzungsverfolgung** - Überwachen Sie Modellanrufe, Token-Verbrauch und Tool-Leistung
- **📊 Visuelle Analysen** - Schöne Diagramme, die Nutzungstrends über die Zeit zeigen
- **🔒 Sicher** - API-Schlüssel wird nur im localStorage des Browsers gespeichert
- **🌙 Dunkelmodus** - Material You-Design mit automatischem Theme-Wechsel
- **🌍 Mehrsprachige Unterstützung** - Verfügbar in 7 Sprachen
- **📱 Responsive** - Funktioniert perfekt auf Desktop, Tablet und Mobil
- **⚡ Schnell** - Gebaut mit Next.js 16 und React 19 für optimale Leistung

## Screenshot

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-de-dark.webp">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-de-light.webp">
  <img alt="Z.AI Usage Dashboard Screenshot" src="https://raw.githubusercontent.com/CNSeniorious000/zai-coding-plan-dashboard/main/.github/screenshots/screenshot-de-dark.webp">
</picture>

## Tech Stack

| Technologie         | Beschreibung                                |
| ------------------- | ------------------------------------------- |
| **Next.js 16**      | React-Framework mit App Router              |
| **React 19**        | React neueste Version mit Server Components |
| **TypeScript**      | Typsichere Entwicklung                      |
| **Tailwind CSS v4** | Utility-First CSS-Framework                 |
| **next-intl**       | Internationalisierungs-Framework (i18n)     |
| **Recharts**        | Datenvisualisierungsbibliothek              |
| **Radix UI**        | Barrierefreie Komponentenbibliothek         |
| **Fumadocs**        | Dokumentationssystem                        |

## Installation

```bash
# Repository klonen
git clone https://github.com/CNSeniorious000/zai-coding-plan-dashboard.git

# Zum Projekt navigieren
cd zai-coding-plan-dashboard

# Abhängigkeiten installieren
npm install
# oder
yarn install
# oder
pnpm install

# Entwicklungsserver starten
npm run dev
```

Öffnen Sie [http://localhost:3377](http://localhost:3377) in Ihrem Browser.

## Verwendung

1. **API-Schlüssel erhalten**
   - Besuchen Sie [Z.AI Platform](https://z.ai/manage-apikey/apikey-list)
   - Erstellen oder kopieren Sie Ihren API-Schlüssel
   - Format：`32hexchars.16alphanumchars`

2. **API-Schlüssel eingeben**
   - Fügen Sie Ihren API-Schlüssel in das Dashboard ein
   - Klicken Sie auf "Abrufen", um Ihre Nutzungsdaten zu laden

3. **Statistiken anzeigen**
   - Quota-Übersicht mit Fortschrittsbalken
   - Token-Nutzung nach Modellen
   - Tool-Nutzung mit Erfolg/Fehlerraten
   - Visuelle Diagramme für Trends

## API-Endpunkte

Das Dashboard verwendet die offiziellen Monitoring-APIs von Z.AI：

| Endpunkt                         | Beschreibung                     |
| -------------------------------- | -------------------------------- |
| `/api/monitor/usage/model-usage` | Modell-Token-Nutzungsstatistiken |
| `/api/monitor/usage/tool-usage`  | Tool-Aufruf-Leistung             |
| `/api/monitor/usage/quota/limit` | Aktuelle Quota-Limits            |

## Projektstruktur

```
src/
├── app/
│   ├── [locale]/          # Lokalisierte Routen (en, zh-CN, ja, ko, es, fr, de)
│   │   ├── page.tsx       # Haupt-Dashboard-Seite
│   │   └── docs/          # Dokumentationsseiten
│   └── api/
│       └── usage/          # Backend-API-Proxy
├── components/
│   ├── Dashboard.tsx      # Haupt-Dashboard-Komponente
│   ├── UsageCharts.tsx    # Datenvisualisierung
│   └── ui/              # Wiederverwendbare UI-Komponenten
├── i18n/                  # Internationalisierungskonfiguration
├── lib/                   # Hilfsfunktionen
└── messages/               # Übersetzungsdateien
```

## Unterstützte Sprachen

- 🇺🇸 [English](README.md)
- 🇨🇳 [简体中文](README.zh-CN.md)
- 🇯🇵 [日本語](README.ja.md)
- 🇰🇷 [한국어](README.ko.md)
- 🇪🇸 [Español](README.es.md)
- 🇫🇷 [Français](README.fr.md)
- 🇩🇪 [Deutsch](README.de.md)

## Dokumentation

Die vollständige Dokumentation ist in der Anwendung unter `/docs` verfügbar.

## Sicherheit

- **API-Schlüssel-Speicherung**：Ihr API-Schlüssel wird nur im `localStorage` Ihres Browsers gespeichert
- **Keine Server-Speicherung**：Die Anwendung speichert oder überträgt Ihren Schlüssel nicht an einen Server außer der offiziellen Z.AI-API
- **Nur Client-Seite**：Das gesamte Datenabholen erfolgt direkt von Ihrem Browser zu Z.AI

## Beitragen

Beiträge sind willkommen! Bitte zögern Sie nicht, einen Pull Request einzureichen.

## Lizenz

Dieses Projekt ist privat.

---

<div align="center">

Mit ❤️ für die Z.AI-Community erstellt

**[English](README.md)** | **[简体中文](README.zh-CN.md)** | **[日本語](README.ja.md)** | **[한국어](README.ko.md)** | **[Español](README.es.md)** | **[Français](README.fr.md)** | **[Deutsch](README.de.md)**

</div>
