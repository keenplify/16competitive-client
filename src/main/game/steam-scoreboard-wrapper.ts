/** Steam launches GoldSrc from its own process, so the launch option is the
 * authoritative place to select the active match's native module. */
export function buildSteamScoreboardWrapper(directory: string, modulePath: string): string {
  const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
  return [
    '#!/bin/sh',
    `session=${shellQuote(directory)}`,
    `module=${shellQuote(modulePath)}`,
    'if [ -f "$session/overlay.enabled" ] && [ -f "$module" ]; then',
    '  export PAPAMO_SKIN_PROBE_SESSION="$session"',
    '  # Steam can retain a module from an older launcher process. Keep only',
    '  # this match module while preserving unrelated preloads.',
    '  other_preloads=',
    '  set -f',
    '  IFS=" :"',
    '  for preload in ${LD_PRELOAD-}; do',
    '    case "$preload" in',
    '      */papamo-cosmetic-module-linux-x86.so) ;;',
    '      *) other_preloads="${other_preloads:+$other_preloads }$preload" ;;',
    '    esac',
    '  done',
    '  unset IFS',
    '  set +f',
    '  export LD_PRELOAD="$module${other_preloads:+ $other_preloads}"',
    'fi',
    'exec "$@"',
    ''
  ].join('\n')
}
