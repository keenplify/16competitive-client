/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'

const remoteRoot = '/root/16competitive'
const artifactRoot = `${remoteRoot}/.cache/web-client-release`
const allowedHosts = new Set(['sg', 'na', 'ws', 'sa'])

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

function ssh(host, command, { agent = false } = {}) {
  return execFileSync(
    'ssh',
    [...(agent ? ['-A'] : []), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
    { stdio: 'inherit' }
  )
}

function destination(host) {
  const config = run('ssh', ['-G', host])
  const setting = (key) => config.match(new RegExp(`^${key} (.+)$`, 'm'))?.[1]
  const hostname = setting('hostname')
  const user = setting('user')
  const port = setting('port')
  if (
    !hostname ||
    !/^[a-zA-Z0-9.-]+$/.test(hostname) ||
    !user ||
    !/^[a-zA-Z0-9_-]+$/.test(user) ||
    !port ||
    !/^\d+$/.test(port)
  ) {
    throw new Error(`Could not resolve a safe SSH destination for ${host}.`)
  }
  return { hostname, user, port }
}

export function releaseWebHosts() {
  const hosts = process.env.RELEASE_WEB_HOSTS?.split(',').map((host) => host.trim()) ?? [
    'sg',
    'na',
    'ws',
    'sa'
  ]
  if (
    !hosts.length ||
    hosts.some((host) => !allowedHosts.has(host)) ||
    new Set(hosts).size !== hosts.length
  ) {
    throw new Error(
      'RELEASE_WEB_HOSTS must list each desired host once, using only sg, na, ws, or sa.'
    )
  }
  return hosts
}

export function deployWebClient(tag, hosts = releaseWebHosts()) {
  if (!/^v\d{4}\.\d{4}\.\d+$/.test(tag)) throw new Error(`Invalid client release tag: ${tag}`)
  if (!hosts.length || hosts.some((host) => !allowedHosts.has(host))) {
    throw new Error('Invalid web release hosts.')
  }

  const artifact = `${artifactRoot}/${tag}.tar.gz`
  const checksum = `${artifact}.sha256`
  console.log(`Building ${tag} web client once on sg...`)
  ssh(
    'sg',
    `set -e; cd ${remoteRoot}; bash src/scripts/prepare-deployment-checkout.sh; git pull --ff-only; mkdir -p ${artifactRoot}; WEB_CLIENT_REF=${tag} WEB_CLIENT_DIST_DIR=${artifactRoot}/${tag}.dist DEPLOY_BUN_BIN=/root/.bun/bin/bun bash src/scripts/build-web-client.sh; tar -C ${artifactRoot}/${tag}.dist -czf ${artifact} .; cd ${artifactRoot}; sha256sum ${tag}.tar.gz > ${tag}.tar.gz.sha256; sha256sum -c ${tag}.tar.gz.sha256`
  )

  const failedHosts = []
  for (const host of hosts) {
    console.log(`Installing the sg web build on ${host}...`)
    try {
      if (host !== 'sg') {
        const { hostname, user, port } = destination(host)
        ssh(host, `mkdir -p ${artifactRoot}`)
        for (const source of [artifact, checksum]) {
          ssh(
            'sg',
            `scp -o BatchMode=yes -o StrictHostKeyChecking=yes -P ${port} ${source} ${user}@${hostname}:${source}.part`,
            { agent: true }
          )
          ssh(host, `mv ${source}.part ${source}`)
        }
      }
      ssh(
        host,
        `set -e; cd ${artifactRoot}; sha256sum -c ${tag}.tar.gz.sha256; rm -rf ${remoteRoot}/web-client-dist.next; mkdir -p ${remoteRoot}/web-client-dist.next; tar -xzf ${tag}.tar.gz -C ${remoteRoot}/web-client-dist.next; test -s ${remoteRoot}/web-client-dist.next/index.html; rm -rf ${remoteRoot}/web-client-dist; mv ${remoteRoot}/web-client-dist.next ${remoteRoot}/web-client-dist`
      )
      console.log(`${host} web client is ready.`)
    } catch {
      failedHosts.push(host)
      console.error(`Web client installation failed on ${host}.`)
    }
  }
  if (failedHosts.length) {
    throw new Error(
      `${tag} was pushed, but web client installation failed on: ${failedHosts.join(', ')}.`
    )
  }
}
