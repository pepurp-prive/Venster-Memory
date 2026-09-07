# Venster-Memory

Een Safari-extensie die ervoor zorgt dat een venster zijn tabbladen niet kwijtraakt als je het
sluit met het **rode bolletje**. Open je Safari daarna weer, dan staan de tabbladen er gewoon —
in het profiel waar ze bij horen.

```
Persoonlijk · 3 tabbladen        ⌘ rood bolletje        Safari weer open
maccess.io                              ─────►                 ─────►        maccess.io
apple.com/mac-mini                                                           apple.com/mac-mini
apple.com/mac-studio                                                         apple.com/mac-studio
```

## Waar dit wel en niet over gaat

Safari bewaart **tabbladgroepen** zelf al. Wat het vergeet zijn de **losse tabbladen** van een
venster — het bovenste item in de zijbalk, boven het kopje met de groepen:

```
▸ Persoonlijk — 3 tabbladen     ← hiervoor is deze extensie
  Persoonlijk tabbladgroepen
    Tijdelijk                   ← bewaart Safari zelf
    Naamloos                    ← bewaart Safari zelf
    Naamloos 1                  ← bewaart Safari zelf
```

Zit je in een tabbladgroep, dan doet de extensie niets. Ze springt alleen bij als een venster
**leeg** opent.

## Profielen

Safari geeft elk profiel zijn eigen kopie van een extensie, met een eigen achtergrondpagina en
een eigen opslag ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10119/)). Dat komt hier
goed uit: het geheugen is **automatisch per profiel gescheiden**. De kopie in *Persoonlijk*
onthoudt alleen Persoonlijke vensters en kan die van *Ai* of *School 3.0* niet eens zien.

Twee dingen om te weten:

- Je moet de extensie **in elk profiel apart aanzetten**; in een nieuw profiel staan extensies
  standaard uit.
- Start Safari op met maar één profielvenster, dan komen de andere profielen terug zodra je daar
  zelf een venster opent (Archief → Nieuw venster → *Ai*). Een extensie kán niet vanzelf een
  venster in een ander profiel openen: zolang er geen venster van dat profiel is, draait die kopie
  van de extensie helemaal niet.

## Wat er precies gebeurt

| Wat je doet | Wat de extensie doet |
|---|---|
| Venster sluiten met het rode bolletje | De tabbladen van dat venster onthouden, in dit profiel |
| Safari afsluiten met ⌘Q terwijl er vensters open staan | Die vensters ook onthouden. Safari stuurt bij het afsluiten geen betrouwbaar signaal meer, dus worden ze bij de volgende start alsnog opgehaald |
| Safari opnieuw openen | De vensters van **de vorige keer** terugzetten, met hun tabbladen, positie en formaat |
| Nieuw venster maken terwijl er al één open is (⌘N) | Niets — je wilde een leeg venster. Aan te zetten in de instellingen |
| Een tabbladgroep openen | Niets; Safari vult dat venster zelf |
| Eén van meerdere vensters sluiten | Niets automatisch, maar het staat in de popup en is met één klik terug |

Alleen de vensters van de laatste keer komen vanzelf terug. Vensters uit een oudere sessie blijven
in het geheugen staan en zijn met één klik uit de popup te halen — zo krijg je niet ineens twintig
vensters op je scherm omdat je Safari twee weken niet had geopend.

Ging het toch mis — bijvoorbeeld omdat je een *lege* tabbladgroep opende, en die is voor een
extensie niet van een leeg venster te onderscheiden — dan staat bovenin de popup
**"Hersteld — ongedaan maken"**. Eén klik en het venster is weer leeg, met de tabbladen terug in
het geheugen.

## Installeren

Je hebt macOS met Xcode nodig; een Safari-extensie is altijd een app.

```sh
./scripts/build-xcode-project.sh
open "build/Venster Memory/Venster Memory.xcodeproj"
```

Daarna:

1. In Xcode één keer op **Run** drukken. Het venster dat verschijnt mag je meteen sluiten.
2. Safari → Instellingen → **Geavanceerd** → *Toon functies voor webontwikkelaars* aanzetten.
3. Safari → **Ontwikkelaar** → *Sta niet-ondertekende extensies toe*.
   Dit moet je na elke herstart van Safari opnieuw doen, zolang de extensie niet ondertekend is.
4. Safari → Instellingen → **Extensies** → Venster-Memory aanzetten en de toegang op
   **"Toestaan op elke website"** zetten.
5. Stap 4 herhalen in elk profiel waar je de extensie wilt.

### Die toegang is niet optioneel

Anders dan Chrome en Firefox geeft Safari een extensie **geen enkele tabblad-URL** tot je dat per
site of in één keer voor alle sites toestaat. Tot die tijd ziet Venster-Memory letterlijk niets en
kan er dus ook niets onthouden worden. De popup zegt het als het misgaat, in plaats van te doen
alsof alles werkt.

## Instellingen

Via de popup → **Instellingen**. Alles geldt per profiel.

| Instelling | Standaard | |
|---|---|---|
| Vensters onthouden | aan | De hoofdschakelaar |
| Alle vensters terugzetten zodra Safari weer opent | aan | Dit is de kernfunctie |
| Ook bij elk nieuw leeg venster het laatst gesloten venster teruggeven | uit | Aanzetten als ⌘N ook je vorige venster moet teruggeven |
| Hoeveel gesloten vensters onthouden | 20 | |
| Pauze tussen tabbladen tijdens herstellen | 60 ms | Safari reageert slecht op tientallen tabbladen tegelijk |
| Wachttijd voordat een venster leeg heet | 700 ms | De tijd die Safari krijgt om een tabbladgroep zelf te vullen |

## Wat er niet bewaard wordt

- Scrollpositie en ingevulde formulieren; alleen URL, titel en volgorde komen terug.
- Privévensters worden bewust genegeerd.
- Tabbladgroepen — die kan een extensie in Safari niet uitlezen, en Safari bewaart ze zelf.
- Sluit je een venster binnen een halve seconde nadat je er een tabblad in veranderde, dan kan die
  laatste wijziging net missen: het geheugen wordt gebundeld weggeschreven.
- Vensters uit oudere sessies komen niet vanzelf terug; die staan in de popup.

## Eerst dit proberen (kost niets)

Twee instellingen van Apple zelf die een deel van het probleem al oplossen als je met ⌘Q afsluit:

- Safari → Instellingen → Algemeen → *Safari opent met: alle vensters van vorige sessie*
- Systeeminstellingen → Bureaublad en Dock → *Sluit vensters bij afsluiten van programma* uit

Sluit je je vensters mét het rode bolletje vóór je afsluit, dan is Safari's eigen sessie leeg en
helpt dit niet. Dat blijft het werk van deze extensie.

## Ontwikkelen

De logica zit in gewone JavaScript-modules zonder buildstap of dependencies. Dezelfde bestanden
draaien in Safari's achtergrondpagina én in de tests.

```sh
npm test        # node --test, met een nagebouwde browser-API
```

```
extension/
  manifest.json
  background.js          start de controller
  lib/
    api.js               dunne laag over de WebExtension-API
    settings.js          instellingen met standaardwaarden
    memory.js            de opslag: spiegel, gesloten vensters, sessies, undo
    track.js             bijhouden wat er open is
    restore.js           een onthouden venster terugzetten
    controller.js        events -> bijhouden of herstellen
  popup/ options/ welcome/ _locales/ images/
tests/
  mock-browser.js        nagebootste browser, inclusief Safari-eigenaardigheden
  track.test.js restore.test.js lifecycle.test.js package.test.js
scripts/
  build-xcode-project.sh   xcrun safari-web-extension-converter
  generate-icons.py        alleen nodig als je de iconen wilt wijzigen
```

De tests dekken onder meer: het rode-bolletje-scenario van begin tot eind, het terughalen van
vensters die bij ⌘Q verdwenen zonder afsluitsignaal, dat een venster dat Safari zelf vult met rust
gelaten wordt, dat alleen de laatste sessie vanzelf terugkomt, dat hetzelfde venster nooit twee
keer wordt teruggezet, dat een mislukt herstel niets kwijtmaakt, en dat "ongedaan maken" precies
terugdraait wat er is gebeurd.

## Licentie

MIT
