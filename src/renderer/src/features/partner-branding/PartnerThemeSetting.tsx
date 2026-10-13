import type { JSX } from 'react'
import { useTranslation, type SupportedLanguageCode } from '../i18n/i18n'
import { usePartnerBrandingStore } from './partner-branding.store'

const copy: Record<SupportedLanguageCode, { label: string; description: string }> = {
  en: {
    label: 'Partner theme',
    description:
      'Show your partner’s colors and lobby background. Turn off to use the standard launcher appearance.'
  },
  ru: {
    label: 'Тема партнёра',
    description:
      'Показывать цвета партнёра и фон лобби. Выключите, чтобы вернуть обычный вид лаунчера.'
  },
  tl: {
    label: 'Tema ng partner',
    description:
      'Ipakita ang mga kulay ng partner at background ng lobby. I-off para bumalik sa karaniwang hitsura ng launcher.'
  },
  th: {
    label: 'ธีมพาร์ทเนอร์',
    description: 'แสดงสีของพาร์ทเนอร์และพื้นหลังล็อบบี้ ปิดเพื่อใช้รูปลักษณ์ปกติของตัวเปิดเกม'
  },
  id: {
    label: 'Tema mitra',
    description:
      'Tampilkan warna mitra dan latar lobi. Matikan untuk memakai tampilan peluncur standar.'
  },
  hi: {
    label: 'पार्टनर थीम',
    description:
      'पार्टनर के रंग और लॉबी की पृष्ठभूमि दिखाएँ। सामान्य लॉन्चर रूप के लिए इसे बंद करें।'
  },
  pt: {
    label: 'Tema do parceiro',
    description:
      'Mostre as cores do parceiro e o fundo do lobby. Desative para usar a aparência padrão do launcher.'
  },
  ja: {
    label: 'パートナーテーマ',
    description:
      'パートナーの色とロビー背景を表示します。標準のランチャー表示に戻すにはオフにしてください。'
  }
}

export function PartnerThemeSetting(): JSX.Element {
  const { language } = useTranslation()
  const enabled = usePartnerBrandingStore((state) => state.enabled)
  const setEnabled = usePartnerBrandingStore((state) => state.setEnabled)
  const text = copy[language]
  return (
    <div className="mt-5 flex min-h-24 items-center justify-between gap-5 border border-white/10 bg-neutral-900/90 p-5 sm:p-7">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-100">{text.label}</p>
        <p
          id="partner-theme-description"
          className="mt-1 max-w-xl text-xs leading-relaxed text-neutral-400"
        >
          {text.description}
        </p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          aria-label={text.label}
          aria-describedby="partner-theme-description"
        />
        <span className="h-6 w-11 border border-white/20 bg-neutral-700 transition peer-checked:border-sky-400 peer-checked:bg-sky-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-400 after:absolute after:top-1 after:left-1 after:size-4 after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
      </label>
    </div>
  )
}
