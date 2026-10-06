export const regionLabel = (region: string): string => {
  if (region === 'sea') return 'SEA'
  if (region === 'sa') return 'South America'

  return region
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const nodeLabel = (nodeId: string): string =>
  nodeId === 'sa-api-1' ? 'south-america-api-1' : nodeId
