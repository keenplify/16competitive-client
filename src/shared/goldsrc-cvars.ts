import ranges from './goldsrc-cvars.json'

export const cvarRanges: Readonly<Record<string, readonly number[]>> = ranges
export function parseGoldsrcCvars(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_CVARS')
  const result: Record<string, number> = {}
  for (const [name, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(cvarRanges, name)) throw new Error('INVALID_CVAR')
    const [min, max] = cvarRanges[name]
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      !/^\d+(?:\.\d{1,6})?$/.test(String(value)) ||
      ([
        'net_graph',
        'cl_showfps',
        'cl_righthand',
        'cl_dynamiccrosshair',
        'cl_crosshair_translucent',
        'hud_centerid'
      ].includes(name) &&
        !Number.isInteger(value))
    ) {
      throw new Error('INVALID_CVAR_VALUE')
    }
    result[name] = value
  }
  return result
}
