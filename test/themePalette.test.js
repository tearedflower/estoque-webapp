import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const css = readFileSync(new URL('../public/themes/industrial.css', import.meta.url), 'utf8')
const [lightCss, darkCss] = css.split(':root.dark {')
const tokens = source => Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(([, key, value]) => [key, value]))
const light = tokens(lightCss)
const dark = { ...light, ...tokens(darkCss) }
function luminance(hex) {
  return hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + .05) / (values[1] + .05)
}

for (const [name, palette] of Object.entries({ light, dark })) {
  test(`${name}: text, controls, tags, selection and primary actions meet AA contrast`, () => {
    const pairs = [
      ...['--ds-text', '--ds-text-soft', '--ds-text-muted', '--ds-text-subtle', '--ds-info', '--ds-danger', '--ds-warning', '--ds-success'].map(key => [key, '--ds-panel']),
      ['--ds-text', '--ds-control-bg'], ['--ds-tag-text', '--ds-tag-bg'],
      ['--ds-active-text', '--ds-active-bg'], ['--ds-primary-text', '--ds-brand'],
      ['--ds-on-danger', '--ds-danger-solid'],
      ['--ds-on-danger', '--ds-danger-hover'], ['--ds-primary-text', '--ds-success-solid'],
      ['--ds-primary-text', '--ds-success-hover'],
      ['--ds-primary-text', '--ds-info-solid'],
      ['--ds-primary-text', '--ds-warning-solid'],
      ['--ds-nav-text', '--ds-nav-bg'], ['--ds-nav-text-muted', '--ds-nav-bg'],
      ...[500, 600, 700, 800].map(shade => ['--ds-primary-text', `--color-primary-${shade}`]),
    ]
    for (const [foreground, background] of pairs) {
      const ratio = contrast(palette[foreground], palette[background])
      assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`)
    }
  })
}

test('UI styles use theme colors; fixed colors are reserved for the printed EPI document', () => {
  function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? files(join(directory, entry.name)) : [join(directory, entry.name)])
  }
  for (const file of files(fileURLToPath(new URL('../src', import.meta.url)))) {
    if (!/\.(css|vue)$/.test(file) || file.endsWith('EpiSheetDialog.vue')) continue
    const source = readFileSync(file, 'utf8')
    const styles = file.endsWith('.css') ? source : [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n')
    assert.doesNotMatch(styles, /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i, file)
    assert.doesNotMatch(source, /(?:bg|text|border)-\[#[\da-f]/i, file)
  }
})
