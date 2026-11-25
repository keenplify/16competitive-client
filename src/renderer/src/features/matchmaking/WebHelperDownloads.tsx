import type { JSX } from 'react'
import { ButtonLink } from '../../components/ui/Button'
import { useTranslation } from '../i18n/i18n'

const helperRelease = 'https://github.com/keenplify/16competitive-client/releases/latest/download/'

export function WebHelperDownloads({
  onDownload
}: {
  onDownload?: (arch: 'x64' | 'arm64' | null) => void
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <>
      {(navigator.platform.toLowerCase().includes('win')
        ? [{ file: 'competitive16-web-helper.exe', arch: null }]
        : [
            { file: 'competitive16-web-helper-linux', arch: 'x64' as const },
            { file: 'competitive16-web-helper-linux-arm64', arch: 'arm64' as const }
          ]
      ).map(({ file, arch }) => (
        <ButtonLink
          key={file}
          variant="primary"
          className="h-auto min-h-11 py-2 text-center"
          href={`${helperRelease}${file}`}
          download
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            onDownload?.(arch)
          }}
        >
          {t('webHelper.download')}
          {arch ? ` · Linux ${arch === 'x64' ? 'x64' : 'ARM64'}` : ''}
        </ButtonLink>
      ))}
    </>
  )
}
