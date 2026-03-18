const supported = [
  { major: 20, minor: 19, patch: 0 },
  { major: 22, minor: 12, patch: 0 },
]

function parseVersion(input) {
  const cleaned = String(input || '').trim().replace(/^v/i, '')
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function compareVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function isSupported(version) {
  return supported.some((min) => version.major === min.major && compareVersion(version, min) >= 0)
}

function minVersionsText() {
  return supported.map((v) => `${v.major}.${v.minor}.${v.patch}`).join(' or ')
}

const strict = process.argv.includes('--strict') || process.env.STRICT_NODE_VERSION === 'true'
const current = parseVersion(process.version)

if (!current) {
  console.error(`[node-version] Unable to parse process.version=${process.version}`)
  process.exit(1)
}

if (isSupported(current)) {
  console.log(`[node-version] ok: ${process.version}`)
  process.exit(0)
}

const message =
  `[node-version] unsupported: ${process.version}. ` +
  `Recommended baseline is ${minVersionsText()} for the current Vite toolchain.`

if (strict) {
  console.error(message)
  process.exit(1)
}

console.warn(`${message} Continuing in warning-only mode.`)
