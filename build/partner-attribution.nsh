; The uninstaller build never calls customInstall. Do not emit unused installer functions.
!ifndef BUILD_UNINSTALLER
!include "WinVer.nsh"

; Reject unsupported Windows before installing files, even if Electron cannot start.
!macro customInit
  ${IfNot} ${AtLeastWin10}
    System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
    IntOp $0 $0 & 0x3ff
    StrCpy $1 "Windows 10 or later is required. Windows 7, Windows 8, and Windows 8.1 are not supported. Upgrade Windows to use 1.6 Competitive."
    ${If} $0 == 25
      StrCpy $1 "Требуется Windows 10 или новее. Windows 7, Windows 8 и Windows 8.1 не поддерживаются. Обновите Windows для использования 1.6 Competitive."
    ${EndIf}
    ${If} $0 == 100
      StrCpy $1 "Kailangan ang Windows 10 o mas bago. Hindi suportado ang Windows 7, Windows 8, at Windows 8.1. I-upgrade ang Windows para magamit ang 1.6 Competitive."
    ${EndIf}
    ${If} $0 == 30
      StrCpy $1 "ต้องใช้ Windows 10 หรือใหม่กว่า ไม่รองรับ Windows 7, Windows 8 และ Windows 8.1 โปรดอัปเกรด Windows เพื่อใช้ 1.6 Competitive"
    ${EndIf}
    ${If} $0 == 33
      StrCpy $1 "Memerlukan Windows 10 atau yang lebih baru. Windows 7, Windows 8, dan Windows 8.1 tidak didukung. Tingkatkan Windows untuk menggunakan 1.6 Competitive."
    ${EndIf}
    ${If} $0 == 22
      StrCpy $1 "É necessário Windows 10 ou posterior. Windows 7, Windows 8 e Windows 8.1 não são compatíveis. Atualize o Windows para usar o 1.6 Competitive."
    ${EndIf}
    ${If} $0 == 17
      StrCpy $1 "Windows 10 以降が必要です。Windows 7、Windows 8、Windows 8.1 はサポートされていません。1.6 Competitive を使用するには Windows をアップグレードしてください。"
    ${EndIf}
    ${If} $0 == 57
      StrCpy $1 "Windows 10 या उसके बाद का संस्करण आवश्यक है। Windows 7, Windows 8 और Windows 8.1 समर्थित नहीं हैं। 1.6 Competitive का उपयोग करने के लिए Windows अपग्रेड करें।"
    ${EndIf}
    MessageBox MB_OK|MB_ICONSTOP "$1"
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

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
!endif
