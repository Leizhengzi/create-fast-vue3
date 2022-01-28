#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

import minimist from 'minimist'
import prompts from 'prompts'
import { red, green, bold } from 'kolorist'
import { postOrderDirectoryTraverse } from './utils/directoryTraverse'
import getCommand from './utils/getCommand'
import clone from 'git-clone'

function wait(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms))
}

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(projectName)
}

function toValidPackageName(projectName) {
  return String(projectName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

function canSafelyOverwrite(dir) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0
}

function emptyDir(dir) {
  postOrderDirectoryTraverse(
    dir,
    (dir) => fs.rmdirSync(dir),
    (file) => fs.unlinkSync(file)
  )
}

async function init() {
  const cwd = process.cwd()
  const argv = minimist(process.argv.slice(2))

  let targetDir = argv._[0]
  const defaultProjectName = !targetDir ? 'fast-vue3-demo' : targetDir

  const forceOverwrite = argv.force

  let result = {}

  try {
    result = await prompts(
      [
        {
          name: 'projectName',
          type: targetDir ? null : 'text',
          message: 'Project name:',
          initial: defaultProjectName,
          onState: (state) => (targetDir = String(state.value).trim() || defaultProjectName)
        },
        {
          name: 'shouldOverwrite',
          type: () => (canSafelyOverwrite(String(targetDir)) || forceOverwrite ? null : 'confirm'),
          message: () => {
            const dirForPrompt =
              targetDir === '.' ? 'Current directory' : `Target directory "${targetDir}"`
            return `${dirForPrompt} is not empty. Remove existing files and continue?`
          }
        },
        {
          name: 'overwriteChecker',
          type: (prev, values = {}) => {
            if (values.shouldOverwrite === false) {
              throw new Error(red('✖') + ' Operation cancelled')
            }
            return null
          }
        },
        {
          name: 'packageName',
          type: () => (isValidPackageName(targetDir) ? null : 'text'),
          message: 'Package name:',
          initial: () => toValidPackageName(targetDir),
          validate: (dir) => isValidPackageName(dir) || 'Invalid package.json name'
        }
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled')
        }
      }
    )
  } catch (cancelled) {
    console.log(cancelled.message)
    process.exit(1)
  }

  const { packageName = toValidPackageName(defaultProjectName), shouldOverwrite } = result
  const root = path.join(cwd, String(targetDir))

  if (shouldOverwrite) {
    emptyDir(root)
  }

  console.log(`\nScaffolding project in ${root}...`)

  clone('https://github.com/MaleWeb/fast-vue3.git', root, {}, (e) => {
    if (e) {
      console.log(`git clone err: ${e}`)
    }
  })

  while (!fs.existsSync(root) || fs.readdirSync(root).length <= 1) {
    wait(500)
  }

  emptyDir(path.join(root, '.git'))

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
  pkg.name = packageName
  pkg.version = '0.0.0'
  delete pkg.author

  const packageManager = /pnpm/.test(process.env.npm_execpath)
    ? 'pnpm'
    : /yarn/.test(process.env.npm_execpath)
    ? 'yarn'
    : 'npm'

  console.log(`\nDone. Now run:\n`)
  if (root !== cwd) {
    console.log(`   ${bold(green(`cd ${path.relative(cwd, root)}`))}`)
  }
  console.log(`  ${bold(green(getCommand(packageManager, 'install')))}`)
  console.log(`  ${bold(green(getCommand(packageManager, 'dev')))}`)
  console.log()
}

init().catch((e) => {
  console.error(e)
})
