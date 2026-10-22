import { createLocalSnapshotCache } from '../../../../shared/local-snapshot-cache'
import { parseCommunityDirectory } from '../../../../shared/community-directory'
import {
  parsePartnerServerStatuses,
  type PartnerServerStatus
} from '../../../../shared/partner-community'

export const communityDirectoryCache = createLocalSnapshotCache(
  'communities',
  parseCommunityDirectory
)
export const communityServerCache = createLocalSnapshotCache<PartnerServerStatus[]>(
  'community-servers',
  (value) => {
    if (!Array.isArray(value)) throw new Error('Invalid cached servers')
    const rows = parsePartnerServerStatuses({
      servers: value.map((row) => ({ ...row, pingSource: 'api' }))
    })
    return rows.map((row, index) => ({
      ...row,
      pingSource: value[index].pingSource === 'client' ? 'client' : 'api'
    }))
  }
)
