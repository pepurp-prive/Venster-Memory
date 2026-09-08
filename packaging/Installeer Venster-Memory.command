#!/usr/bin/env bash
set -euo pipefail

# Installeert Venster Memory.app in /Applications en meldt de Safari-extensie aan.
# Dubbelklik dit bestand. Komt het uit een download, dan de eerste keer met
# rechtermuisknop -> Open, anders houdt Gatekeeper het tegen.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Venster Memory.app"
SOURCE_APP="$SCRIPT_DIR/$APP_NAME"
INSTALL_ROOT="/Applications"
DEST_APP="$INSTALL_ROOT/$APP_NAME"

if [[ ! -d "$SOURCE_APP" ]]; then
  echo "Kan '$APP_NAME' niet vinden naast dit script." >&2
  echo "Pak de zip helemaal uit en probeer het opnieuw." >&2
  read -r -p "Druk op Enter om dit venster te sluiten."
  exit 1
fi

# De zip komt van internet, dus alles erin draagt een quarantaine-vlag. Die moet
# eraf, anders weigert Safari de extensie te laden.
/usr/bin/xattr -dr com.apple.quarantine "$SOURCE_APP" 2>/dev/null || true

/usr/bin/pkill -x "Venster Memory" >/dev/null 2>&1 || true

if [[ -d "$DEST_APP" ]]; then
  TRASH_ROOT="${HOME}/.Trash"
  mkdir -p "$TRASH_ROOT"
  BACKUP="$TRASH_ROOT/Venster Memory-verouderd-$(date +%Y%m%d-%H%M%S).app"
  mv "$DEST_APP" "$BACKUP"
  echo "Vorige versie naar de prullenmand verplaatst."
fi

/usr/bin/ditto "$SOURCE_APP" "$DEST_APP"

if ! codesign --verify --deep --strict "$DEST_APP" 2>/dev/null; then
  echo "Let op: de handtekening kon niet worden geverifieerd." >&2
  echo "De extensie werkt dan alleen met 'Sta niet-ondertekende extensies toe' aan." >&2
fi

/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST_APP"

# Meld elke ingebouwde extensie aan bij het systeem, zodat Safari hem meteen ziet.
while IFS= read -r -d '' APPEX; do
  /usr/bin/pluginkit -a "$APPEX" >/dev/null 2>&1 || true
done < <(find "$DEST_APP/Contents/PlugIns" -maxdepth 1 -name '*.appex' -print0 2>/dev/null)

/usr/bin/open "$DEST_APP"

cat <<'NEXT'

Venster-Memory is geinstalleerd in /Applications.

Nu nog in Safari aanzetten:

  1. Safari > Instellingen > Geavanceerd
     -> "Toon functies voor webontwikkelaars" aan
  2. Tabblad Ontwikkelaar
     -> "Sta niet-ondertekende extensies toe" aan
  3. Tabblad Extensies
     -> Venster-Memory aanvinken
     -> toegang op "Toestaan op elke website" zetten

Zonder die laatste stap geeft Safari geen enkele URL door en onthoudt de
extensie niets. Herhaal stap 3 in elk profiel waar je hem wilt gebruiken.

NEXT
read -r -p "Druk op Enter om dit venster te sluiten."
