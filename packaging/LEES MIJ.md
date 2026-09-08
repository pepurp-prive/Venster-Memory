# Venster-Memory installeren voor Safari

Sluit je een Safari-venster met het **rode bolletje**, dan zijn de tabbladen weg zodra je Safari
weer opent. Venster-Memory onthoudt ze en zet ze terug — per profiel.

---

## Begin hier

**Dubbelklik op `Installeer Venster-Memory.command`.** Dat is alles.

Komt de zip uit een download, dan de eerste keer met **rechtermuisknop → Open**, anders houdt
Gatekeeper het tegen. Klik in het venster dat verschijnt nog een keer op **Open**.

> **Geef deze map niet aan Safari.** Kies je hem bij *Ontwikkelaar → Voeg tijdelijke extensie toe*,
> dan krijg je **"Extensie niet ondersteund"**. Klopt ook: in deze map zit een app, geen losse
> extensie. Voor die route is er een aparte download, `Venster-Memory-extensie-<versie>.zip` —
> zie *Alternatief* onderaan.

Wat het installatiescript doet: de app naar `/Applications` zetten, een oude versie naar de
prullenmand, de extensie bij Safari aanmelden en de app openen.

## Daarna: aanzetten in Safari

De extensie zit ín de app. Zichtbaar maken kost vier stappen:

1. **Safari → Instellingen → Geavanceerd** → zet **Toon functies voor webontwikkelaars** aan.
2. Tabblad **Ontwikkelaar** → zet **Sta niet-ondertekende extensies toe** aan.
3. Tabblad **Extensies** → vink **Venster-Memory** aan.
4. Zet de toegang van de extensie op **Toestaan op elke website**.

**Stap 2** is nodig omdat deze versie niet via de App Store wordt verspreid. Safari zet die
toestemming na het afsluiten weer uit; vink hem dan opnieuw aan.

**Stap 4 is niet optioneel.** Anders dan Chrome en Firefox geeft Safari een extensie *geen enkele
tabblad-URL* tot je het toestaat. Zonder die toestemming ziet Venster-Memory letterlijk niets en
onthoudt het niets. De popup van de extensie waarschuwt je als dit nog niet goed staat.

## En per profiel herhalen

Safari geeft elk profiel zijn eigen kopie van een extensie, met een eigen geheugen. Dat is precies
de bedoeling: *Persoonlijk* onthoudt alleen Persoonlijke vensters. Maar het betekent ook dat je
**stap 3 en 4 in elk profiel** moet herhalen — in een nieuw profiel staan extensies standaard uit.

## Werkt het?

1. Open drie tabbladen. De popup van de extensie zegt hoeveel er wordt bijgehouden.
2. Sluit het venster met het **rode bolletje**.
3. Open Safari weer: de drie tabbladen staan er, op dezelfde plek en in hetzelfde formaat.

Verder:

- Twee vensters, allebei gesloten, Safari weer open → beide komen terug.
- Een **tabbladgroep** openen → de extensie laat dat venster met rust; die bewaart Safari zelf al.
  Venster-Memory is er voor het bovenste item in de zijbalk, `<profiel> — N tabbladen`.
- Een venster dat je zelf opent terwijl er al één open is, blijft leeg. Aan te zetten via
  **Instellingen** in de popup.
- Ging er iets mis, bijvoorbeeld omdat je een lege tabbladgroep opende? Bovenin de popup staat
  **"Hersteld — ongedaan maken"**. Eén klik en het venster is weer leeg, met de tabbladen terug in
  het geheugen.

## Als Venster-Memory niet in de lijst staat

- Heb je het installatiescript echt gedraaid? Staat `Venster Memory.app` in `/Applications`?
- Safari helemaal afsluiten (⌘Q) en opnieuw openen.
- Staat **Sta niet-ondertekende extensies toe** nog aan? Die gaat bij elke herstart uit.
- Kijk in het juiste profiel: extensies staan per profiel apart aan.

---

## Alternatief: tijdelijk laden, zonder installeren

Alleen om snel te kijken of het werkt.

1. Download **`Venster-Memory-extensie-<versie>.zip`** van de Releases-pagina — een aparte zip, niet
   deze.
2. Pak hem uit. Je krijgt één map: `Venster-Memory-extensie`.
3. **Ontwikkelaar → Voeg tijdelijke extensie toe** en kies precies die map. Niet een map eromheen:
   Safari wil de map waarin `manifest.json` zelf ligt.

Maar: een tijdelijke extensie wordt **uitgeladen zodra je Safari afsluit**. En juist het afsluiten
van Safari is waar deze extensie voor bestaat — na een herstart is hij weg en herstelt hij dus
niets. Voor dagelijks gebruik moet je de app installeren.

Gebruik er één van beide tegelijk, niet allebei: het worden twee losse extensies met elk hun eigen
geheugen.

## Wat er niet bewaard wordt

Scrollpositie en ingevulde formulieren; alleen URL, titel en volgorde komen terug. Privévensters
worden bewust genegeerd.

## Broncode

https://github.com/pepurp-prive/Venster-Memory
