!define RV_DOCUMENT_PROGID "io.github.readmeviewer.viewer.Document"

!macro RV_OPEN_WITH_EXTENSIONS operation
  !insertmacro ${operation} ".md"
  !insertmacro ${operation} ".markdown"
  !insertmacro ${operation} ".mdown"
  !insertmacro ${operation} ".mdwn"
  !insertmacro ${operation} ".mkd"
  !insertmacro ${operation} ".txt"
  !insertmacro ${operation} ".json"
  !insertmacro ${operation} ".jsonc"
  !insertmacro ${operation} ".json5"
  !insertmacro ${operation} ".jsonl"
  !insertmacro ${operation} ".ndjson"
  !insertmacro ${operation} ".ini"
  !insertmacro ${operation} ".conf"
  !insertmacro ${operation} ".cfg"
  !insertmacro ${operation} ".cnf"
  !insertmacro ${operation} ".properties"
  !insertmacro ${operation} ".toml"
  !insertmacro ${operation} ".yaml"
  !insertmacro ${operation} ".yml"
  !insertmacro ${operation} ".xml"
  !insertmacro ${operation} ".xaml"
  !insertmacro ${operation} ".html"
  !insertmacro ${operation} ".htm"
  !insertmacro ${operation} ".xhtml"
  !insertmacro ${operation} ".css"
  !insertmacro ${operation} ".scss"
  !insertmacro ${operation} ".less"
  !insertmacro ${operation} ".js"
  !insertmacro ${operation} ".mjs"
  !insertmacro ${operation} ".cjs"
  !insertmacro ${operation} ".jsx"
  !insertmacro ${operation} ".ts"
  !insertmacro ${operation} ".mts"
  !insertmacro ${operation} ".cts"
  !insertmacro ${operation} ".tsx"
  !insertmacro ${operation} ".dart"
  !insertmacro ${operation} ".java"
  !insertmacro ${operation} ".kt"
  !insertmacro ${operation} ".kts"
  !insertmacro ${operation} ".go"
  !insertmacro ${operation} ".rs"
  !insertmacro ${operation} ".py"
  !insertmacro ${operation} ".pyw"
  !insertmacro ${operation} ".pyi"
  !insertmacro ${operation} ".c"
  !insertmacro ${operation} ".h"
  !insertmacro ${operation} ".cpp"
  !insertmacro ${operation} ".cc"
  !insertmacro ${operation} ".cxx"
  !insertmacro ${operation} ".hpp"
  !insertmacro ${operation} ".hh"
  !insertmacro ${operation} ".hxx"
  !insertmacro ${operation} ".cs"
  !insertmacro ${operation} ".php"
  !insertmacro ${operation} ".rb"
  !insertmacro ${operation} ".sh"
  !insertmacro ${operation} ".bash"
  !insertmacro ${operation} ".zsh"
  !insertmacro ${operation} ".ps1"
  !insertmacro ${operation} ".psd1"
  !insertmacro ${operation} ".psm1"
  !insertmacro ${operation} ".bat"
  !insertmacro ${operation} ".cmd"
  !insertmacro ${operation} ".lua"
  !insertmacro ${operation} ".sql"
  !insertmacro ${operation} ".swift"
  !insertmacro ${operation} ".scala"
  !insertmacro ${operation} ".groovy"
  !insertmacro ${operation} ".gradle"
  !insertmacro ${operation} ".ex"
  !insertmacro ${operation} ".exs"
  !insertmacro ${operation} ".hs"
  !insertmacro ${operation} ".jl"
  !insertmacro ${operation} ".proto"
  !insertmacro ${operation} ".vue"
  !insertmacro ${operation} ".svelte"
  !insertmacro ${operation} ".graphql"
  !insertmacro ${operation} ".gql"
  !insertmacro ${operation} ".diff"
  !insertmacro ${operation} ".patch"
!macroend

!macro RV_ADD_OPEN_WITH extension
  WriteRegStr HKCU "Software\Classes\${extension}\OpenWithProgids" "${RV_DOCUMENT_PROGID}" ""
!macroend

!macro RV_REMOVE_OPEN_WITH extension
  DeleteRegValue HKCU "Software\Classes\${extension}\OpenWithProgids" "${RV_DOCUMENT_PROGID}"
  DeleteRegKey /ifempty HKCU "Software\Classes\${extension}\OpenWithProgids"
  DeleteRegKey /ifempty HKCU "Software\Classes\${extension}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\${RV_DOCUMENT_PROGID}" "" "${PRODUCTNAME}"
  WriteRegStr HKCU "Software\Classes\${RV_DOCUMENT_PROGID}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr HKCU "Software\Classes\${RV_DOCUMENT_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  ; Windows expects a REG_NONE marker, which NSIS cannot write directly.
  Push $0
  Push $1
  System::Call 'advapi32::RegOpenKeyExW(p 0x80000001, w "Software\Classes\${RV_DOCUMENT_PROGID}", i 0, i 2, *p .r1) i .r0'
  StrCmp $0 0 0 +3
  System::Call 'advapi32::RegSetValueExW(p r1, w "AllowSilentDefaultTakeOver", i 0, i 0, p 0, i 0) i'
  System::Call 'advapi32::RegCloseKey(p r1) i'
  Pop $1
  Pop $0
  !insertmacro RV_OPEN_WITH_EXTENSIONS RV_ADD_OPEN_WITH
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro RV_OPEN_WITH_EXTENSIONS RV_REMOVE_OPEN_WITH
  DeleteRegKey HKCU "Software\Classes\${RV_DOCUMENT_PROGID}"
  !insertmacro UPDATEFILEASSOC
!macroend
