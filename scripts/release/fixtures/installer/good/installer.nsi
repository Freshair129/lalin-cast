; Fixture installer.nsi for scripts/release/selftest.ps1 -- clean, no registry scheme registration.
Section "Install"
  SetOutPath "$INSTDIR"
  File "lalin-cast.exe"
SectionEnd
