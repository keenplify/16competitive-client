!include "StrFunc.nsh"
${StrStr}

!macro customInstall
  ; Content remains signed. Only the public referral ID is carried in the filename.
  ${StrStr} $R1 "$EXEFILE" "--partner-"
  StrCmp $R1 "" partner_attribution_done
  StrCpy $R2 $R1 36 10
  FileOpen $R3 "$INSTDIR\resources\partner-attribution.json" w
  IfErrors partner_attribution_done
  FileWrite $R3 '{"partnerId":"$R2"}'
  FileClose $R3
  partner_attribution_done:
!macroend
