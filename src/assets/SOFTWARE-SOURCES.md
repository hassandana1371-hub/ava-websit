# Software catalogue sources — checked 2026-10-29

All links are manufacturer/project references, with TLS verification enabled. Installers are not mirrored in this repository. “Current version” links are rolling manufacturer pages, not a promise that a particular release was tested on an AvA installation.

| Entry | Official source | Evidence / limitation |
| --- | --- | --- |
| NovaLCT | https://www.novastar.tech/download/download.html?catid=7 | HTTP 200. Software data endpoint https://www.novastar.tech/download/data.html?catid=7&typeid=156 lists **NovaLCT V5.9.2**, guides and release notes. Installer itself was not downloaded or executed. |
| NovaStudio | Same NovaStar download centre | Name/direct current installer not found in Software, LED Control System or Discontinued data checked. Marked legacy compatibility reference; no current release or continued support claimed. |
| vMix | https://www.vmix.com/software/download.aspx | Official download reference. Environment destination policy denied connection (proxy 403); exact latest version **not verified**. No version number advertised. |
| Resolume | https://resolume.com/download/ | Official Arena/Avenue download reference. Environment destination policy denied connection (proxy 403); exact latest version **not verified**. No version number advertised. |
| OBS Studio | https://github.com/obsproject/obs-studio/releases/latest | HTTP 200, resolved to `/releases/tag/33.0.0`. Text source + Scroll filter for moving text; scoreboard requires a separate browser source/template. GPL software; no claim of a bundled scoreboard. |
| CasparCG | https://github.com/CasparCG/server/releases/latest | HTTP 200, resolved to `/releases/tag/v2.5.1-stable`. HTML graphics require templates and a compatible client. Client reference https://github.com/CasparCG/client; latest redirect observed `/releases/tag/v2.3.1`. It is not an out-of-box scoring app for every sport. |
| Xibo | https://github.com/xibosignage/xibo-cms/releases/latest | HTTP 200, resolved to `/releases/tag/4.5.5`. CMS requires compatible Player; player licensing/hosting may cost extra. Not an LED receiving-card setup utility. |

Manufacturer pages and release metadata were checked, not software execution, Persian text rendering, device compatibility or commercial licences. These remain installation-specific checks. NovaStudio’s button says “مرجع رسمی و سازگاری”, not a verified direct download. vMix/Resolume buttons lead to their official current-version pages.

Data: `src/software-catalog.json`, embedded in `index.html` by `build.py`. The backend adds missing IDs once (`softwareRevision=1`), preserving existing IDs, custom edits, drafts, products, media, account and statistics. Subsequent removals remain removed.
