const fs = require('fs')
const YAML = require('yaml')
const consola = require('consola')

const { CHECK } = require('./file-parser')
const { getGlobalSettings } = require('../services/utils')
const bundle = require('./bundler')

async function parseCheck(check, groupSettings = null) {
  const { settings } = YAML.parse(getGlobalSettings())
  if (check.error) {
    consola.warn(`Skipping file ${check.filePath}: ${check.error} `)
    return null
  }

  const parsedCheck = YAML.parse(fs.readFileSync(check.filePath, 'utf8'))

  // TODO: Add json schemas to vefify that yaml
  // contains required checks properties.

  if (!parsedCheck) {
    consola.warn(`Skipping file ${check.filePath}: FileEmpty`)
    return null
  }

  if (parsedCheck.checkType.toLowerCase() === 'browser' && parsedCheck.path) {
    const [output] = await bundle(parsedCheck)
    parsedCheck.script = output.code
    parsedCheck.map = output.map
  }

  parsedCheck.logicalId = check.name
  parsedCheck.settings = { ...settings[0], ...parsedCheck.settings }

  return parsedCheck
}

async function parseChecksTree(tree, parent = null) {
  const parsedTree = parent ? { checks: {} } : { checks: {}, groups: {} }

  for (let i = 0; i < tree.length; i += 1) {
    if (tree[i].type === CHECK) {
      const parsedCheck = await parseCheck(tree[i], parent)
      parsedCheck && (parsedTree.checks[parsedCheck.logicalId] = parsedCheck)
      continue
    }

    // We only allow two level of directory nesting:
    // root checks and checks within a group.
    if (parent) {
      continue
    }

    let groupSettings = {}
    if (fs.existsSync(tree[i].settings)) {
      groupSettings =
        YAML.parse(fs.readFileSync(tree[i].settings, 'utf8')) || {}
    }

    parsedTree.groups[tree[i].name] = {
      name: tree[i].name,
      settings: groupSettings,
    }
    const checksLeaf = await parseChecksTree(tree[i].checks, groupSettings)
    const newChecksLeaf = { ...checksLeaf.checks, ...parsedTree.checks }
    parsedTree.checks = newChecksLeaf
  }
  return parsedTree
}

module.exports = {
  parseChecksTree,
}
