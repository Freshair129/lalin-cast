; Fixture installer.nsi for scripts/release/selftest.ps1 -- intentionally contains the forbidden
; scheme self-registration string (mixed case, to exercise the case-insensitive match).
Section "Install"
  WriteRegStr HKCR "Classes\LALIN-CAST" "" "URL:lalin-cast Protocol"
SectionEnd
