/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

type AllyTag = { id: number; x: number; y: number; money: number; weapon: number; scale: number; name: string }

declare global {
  interface Window {
    allyTags?: { onTags(listener: (value: string) => void): () => void }
  }
}

const weaponAssets: Record<number, { name: string; src: string }> = {
  1: { name: 'P228', src: 'weapon-icons/14-sig-p228-category-icon.png' },
  3: { name: 'Scout', src: 'weapon-icons/25-scout-category-icon.png' },
  5: { name: 'XM1014', src: 'weapon-icons/28-xm1014-category-icon.png' },
  7: { name: 'MAC-10', src: 'weapon-icons/35-mac-10-category-icon.png' },
  8: { name: 'AUG', src: 'weapon-icons/20-aug-category-icon.png' },
  10: { name: 'Dual Elites', src: 'weapon-icons/12-dual-elites-category-icon.png' },
  11: { name: 'Five-Seven', src: 'weapon-icons/13-five-seven-category-icon.png' },
  12: { name: 'UMP-45', src: 'weapon-icons/34-ump45-category-icon.png' },
  13: { name: 'SG 550', src: 'weapon-icons/26-sig-550-category-icon.png' },
  14: { name: 'Galil', src: 'weapon-icons/21-galil-category-icon.png' },
  15: { name: 'FAMAS', src: 'weapon-icons/24-famas-category-icon.png' },
  16: { name: 'USP', src: 'weapon-icons/10-usp-category-icon.png' },
  17: { name: 'Glock', src: 'weapon-icons/11-glock-category-icon.png' },
  18: { name: 'AWP', src: 'weapon-icons/17-awp-category-icon.png' },
  19: { name: 'MP5', src: 'weapon-icons/31-mp5-category-icon.png' },
  20: { name: 'M249', src: 'weapon-icons/04-m249-category-icon.png' },
  21: { name: 'M3', src: 'weapon-icons/29-m3-category-icon.png' },
  22: { name: 'M4A1', src: 'weapon-icons/19-m4a1-category-icon.png' },
  23: { name: 'TMP', src: 'weapon-icons/33-tmp-category-icon.png' },
  24: { name: 'G3SG1', src: 'weapon-icons/22-g3-sg-1-category-icon.png' },
  26: { name: 'Desert Eagle', src: 'weapon-icons/09-desert-eagle-category-icon.png' },
  27: { name: 'SG 552', src: 'weapon-icons/23-sig-552-category-icon.png' },
  28: { name: 'AK-47', src: 'weapon-icons/18-ak-47-category-icon.png' },
  29: { name: 'Knife', src: 'weapon-icons/03-knife-category-icon.png' },
  30: { name: 'P90', src: 'weapon-icons/32-p90-category-icon.png' }
}

function parseTags(value: string): AllyTag[] {
  const lines = value.split('\n')
  if (!lines.shift()?.startsWith('#16c-ally-tags-v1\t') || lines.length > 32) return []
  const tags: AllyTag[] = []
  const seen = new Set<number>()
  for (const line of lines) {
    if (!line) continue
    const fields = line.split('\t')
    if (fields.length !== 7) return []
    const [id, x, y, money, weapon, scale] = fields.slice(0, 6).map(Number)
    const name = fields[6]
    if (
      !Number.isInteger(id) ||
      id < 1 ||
      id > 32 ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(money) ||
      money < 0 ||
      money > 16000 ||
      !Number.isInteger(weapon) ||
      weapon < 0 ||
      weapon > 30 ||
      !Number.isInteger(scale) ||
      scale < 55 ||
      scale > 100 ||
      !name ||
      name.length > 32
    )
      return []
    if (seen.has(id)) return []
    seen.add(id)
    tags.push({ id, x, y, money, weapon, scale, name })
  }
  return tags
}

function AllyTags(): React.JSX.Element {
  const [tags, setTags] = useState<AllyTag[]>([])
  useEffect(() => {
    let previous = ''
    return window.allyTags?.onTags((value) => {
      if (value === previous) return
      previous = value
      setTags(parseTags(value))
    })
  }, [])
  return (
    <main className="ally-tags" aria-label="Allied player tags">
      {tags.map((tag) => {
        const weapon = weaponAssets[tag.weapon]
        return (
          <div className="ally-tag" key={tag.id} style={{
            left: tag.x,
            top: tag.y,
            transform: `translate(-50%, -100%) scale(${tag.scale / 100})`
          }}>
            <span className="ally-arrow">▼</span>
            <div className="ally-loadout">
              {weapon && <img src={weapon.src} alt={weapon.name} />}
              <span>{tag.name}</span>
            </div>
            <strong>${tag.money.toLocaleString('en-US')}</strong>
          </div>
        )
      })}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<AllyTags />)
