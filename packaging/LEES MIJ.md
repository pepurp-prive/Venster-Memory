# Venster-Memory installeren voor Safari

Sluit je een Safari-venster met het **rode bolletje**, dan zijn de tabbladen weg zodra je Safari
weer opent. Venster-Memory onthoudt ze en zet ze terug — per profiel.

## 1. App installeren

1. Klik met de **rechtermuisknop** op **Installeer Venster-Memory.command** en kies **Open**.
   (De eerste keer met rechtermuisknop, anders houdt Gatekeeper het bestand tegen omdat het van
   internet komt. Klik in het venster dat verschijnt op **Open**.)
2. De app wordt in `/Applications` geplaatst en geopend.
3. Een bestaande versie gaat eerst naar de prullenmand.

## 2. Safari aanzetten

De Safari-extensie zit al in **Venster Memory.app**.

1. Open Safari en kies **Safari > Instellingen > Geavanceerd**.
2. Zet **Toon functies voor webontwikkelaars** aan.
3. Open het tabblad **Ontwikkelaar** en zet **Sta niet-ondertekende extensies toe** aan.
4. Open het tabblad **Extensies** en vink **Venster-Memory** aan.
5. Zet de toegang van de extensie op **Toestaan op elke website**.

Stap 3 is nodig omdat deze versie niet via de App Store wordt verspreid. Safari zet die
toestemming na het afsluiten opnieuw uit; vink hem dan opnieuw aan.

Stap 5 is niet optioneel. Anders dan Chrome en Firefox geeft Safari een extensie **geen enkele
tabblad-URL** tot je dat toestaat. Zonder die toestemming ziet Venster-Memory letterlijk niets en
onthoudt het niets — de popup zegt het als het misgaat.

## 3. Per profiel herhalen

Safari geeft elk profiel zijn eigen kopie van een extensie, met een eigen geheugen. Dat is precies
de bedoeling: *Persoonlijk* onthoudt alleen Persoonlijke vensters. Maar het betekent ook dat je
stap 4 en 5 moet herhalen in **elk profiel** waar je de extensie wilt — in een nieuw profiel staan
extensies standaard uit.

## Controle

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

## Wat er niet bewaard wordt

Scrollpositie en ingevulde formulieren; alleen URL, titel en volgorde komen terug. Privévensters
worden bewust genegeerd.

## Broncode

https://github.com/pepurp-prive/Venster-Memory
