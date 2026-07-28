const { getDefaultConfig } = require('expo/metro-config')
const exclusionList = require('metro-config/src/defaults/exclusionList')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

const escapePathForRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\+/g, '[/\\\\]')

config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]
config.resolver.blockList = exclusionList([
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, '.codex'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, '.git'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'admin'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'docs'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'scripts'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.resolve(monorepoRoot, 'supabase'))}[/\\\\].*`),
])

module.exports = config
