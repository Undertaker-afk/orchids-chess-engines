## Project: Trinity Chess Engines

This repository contains the source code for the Trinity chess engines, a family of chess engines developed by me, Florian Ruppert. The engines are written in JavaScript and are designed to be fast and efficient while still being easy to understand and modify.



## making backups
```$ts = Get-Date -Format 'yyyyMMdd-HHmmss'; $backupDir = Join-Path 'backups' ("unfixed-" + $ts); New-Item -ItemType Directory -Path $backupDir -Force | Out-Null; node .\build.js; Copy-Item .\src\11_search.js (Join-Path $backupDir '11_search.js'); Copy-Item .\src\02_zobrist.js (Join-Path $backupDir '02_zobrist.js'); Copy-Item .\dist\Trinity-modular.js (Join-Path $backupDir 'Trinity-modular.unfixed.js'); Copy-Item .\dist\Trinity-modular.js .\dist\Trinity-modular.unfixed.js -Force; Write-Output ("BACKUP_DIR=" + $backupDir)```

## testing
```node .\build.js; node --check .\dist\Trinity-modular.js; python .\scripts\head_to_head_modular.py --games 8 --movetime 1200 --timeout 8 --max-plies 220```