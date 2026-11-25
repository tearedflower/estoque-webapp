import { test, expect } from '@playwright/test'

async function readable(locator) {
  const ratio = await locator.evaluate(element => {
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    let parent = element
    while (parent && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(parent).backgroundColor)) parent = parent.parentElement
    const values = [luminance(getComputedStyle(element).color), luminance(getComputedStyle(parent).backgroundColor)].sort((a, b) => b - a)
    return (values[0] + .05) / (values[1] + .05)
  })
  expect(ratio).toBeGreaterThanOrEqual(4.5)
}

async function login(page) {
  let response = await page.request.post('/api/auth/login', { data: { login: 'admin', pin: 'senha-browser-123' } })
  if (response.status() === 401) response = await page.request.post('/api/auth/login', { data: { login: 'admin', pin: 'admin123' } })
  expect(response.status()).toBe(200)
  const { user } = await response.json()
  if (user.mustChangePassword) expect((await page.request.put(`/api/auth/users/${user.id}`, { data: { pin: 'senha-browser-123' } })).status()).toBe(200)
}

// Valida os componentes compartilhados no tema padrão, em claro e escuro.
test('ficha da variação e cadastros mantêm layout e operações em claro e escuro', async ({ page }) => {
  await login(page)
  const item = await (await page.request.post('/api/items', { data: { name: 'Água Sanitária para Limpeza e Higienização', group: 'Limpeza', category: 'Produtos', unit: 'UN', attributes: ['Marca', 'Volume'] } })).json()
  const variation = await (await page.request.post('/api/items/variations', { data: { itemId: item.id, values: { Marca: 'Q-Boa', Volume: '1L' }, stock: 72 } })).json()
  expect(variation.id).toBeTruthy()
  expect((await page.request.post('/api/suppliers', { data: { name: 'Fornecedor de teste visual', description: 'Materiais de limpeza' } })).status()).toBe(200)
  expect((await page.request.post('/api/locations', { data: { name: 'Almoxarifado visual', description: 'Local principal' } })).status()).toBe(200)
  await page.goto('/')
  for (const dark of [false, true]) {
      await page.goto(`/#/inventario?variationId=${variation.id}`)
      await page.reload()
      await page.evaluate(async dark => {
        const { loadVisualStyle } = await import('/src/composables/useTheme.js')
        loadVisualStyle('industrial')
        document.documentElement.classList.toggle('dark', dark)
      }, dark)
      const sheet = page.getByRole('dialog', { name: 'Ficha operacional da variação', exact: true })
      await expect(sheet).toBeVisible()
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 })
        const boxes = await Promise.all(['Entrada', 'Saída', 'Ajustar'].map(name => sheet.getByRole('button', { name, exact: true }).boundingBox()))
        expect(Math.max(...boxes.map(box => box.height)) - Math.min(...boxes.map(box => box.height))).toBeLessThan(1)
        expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1)
        const heading = await sheet.getByRole('heading', { name: item.name, exact: true }).boundingBox()
        const catalog = await sheet.getByRole('button', { name: 'Ver no catálogo', exact: true }).boundingBox()
        const photo = await sheet.getByRole('button', { name: 'Adicionar foto à variação', exact: true }).boundingBox()
        expect(heading.x).toBeGreaterThanOrEqual(photo.x + photo.width)
        expect(catalog.x >= heading.x + heading.width || catalog.y >= heading.y + heading.height).toBe(true)
        expect(await sheet.locator('section').first().evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        if (width === 390) await page.screenshot({ path: test.info().outputPath(`ficha-mobile-industrial-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' })
      }
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.screenshot({ path: test.info().outputPath(`ficha-industrial-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
      for (const [tab, title, headers] of [
        ['fornecedores', 'Fornecedores', ['Fornecedor', 'Observação', 'Status', 'Ações']],
        ['operadores', 'Operadores', ['Nome', 'Login', 'Perfil', 'Status', 'Ações']],
      ]) {
        await page.goto(`/#/cadastros?subTab=${tab}`)
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        for (const name of headers) { const header = page.getByRole('columnheader', { name, exact: true }); await expect(header).toBeVisible(); await readable(header) }
        await page.screenshot({ path: test.info().outputPath(`${tab}-industrial-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' })
        await page.setViewportSize({ width: 390, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.setViewportSize({ width: 1280, height: 900 })
      }
      await page.goto('/#/cadastros?subTab=locais')
      await expect(page.getByRole('heading', { name: 'Locais', exact: true })).toBeVisible()
      await page.getByRole('searchbox', { name: 'Buscar locais', exact: true }).fill('Almoxarifado visual')
      await expect(page.getByText('Almoxarifado visual', { exact: true })).toBeVisible()
      await page.screenshot({ path: test.info().outputPath(`locais-industrial-${dark ? 'dark' : 'light'}.png`), animations: 'disabled' })
      await page.setViewportSize({ width: 390, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.setViewportSize({ width: 1280, height: 900 })
  }
  await page.goto('/#/cadastros?subTab=fornecedores')
  const supplierSearch = page.getByRole('searchbox', { name: 'Buscar fornecedores', exact: true })
  await supplierSearch.fill('sem-correspondencia-visual')
  await expect(page.getByText('Nenhum fornecedor encontrado com esses filtros.')).toBeVisible()
  await supplierSearch.fill('Fornecedor de teste visual')
  const supplierRow = page.locator('.registry-table tbody tr').first()
  await expect(supplierRow.getByText('Fornecedor de teste visual', { exact: true })).toBeVisible()
  await supplierRow.getByTitle('Editar', { exact: true }).click()
  await supplierRow.locator('input').nth(1).fill('Descrição revisada')
  await supplierRow.getByTitle('Salvar', { exact: true }).click()
  await expect(supplierRow.getByText('Descrição revisada', { exact: true })).toBeVisible()
  await supplierRow.getByRole('button', { name: 'Desativar fornecedor Fornecedor de teste visual' }).click()
  await page.getByLabel('Filtrar fornecedores por status').selectOption('inactive')
  await expect(supplierRow).toBeVisible()
  await page.goto('/#/cadastros?subTab=operadores')
  await page.getByRole('searchbox', { name: 'Buscar operadores', exact: true }).fill('sem-correspondencia-visual')
  await expect(page.getByText('Nenhum operador encontrado com esses filtros.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar operadores', exact: true }).fill('admin')
  await expect(page.getByRole('cell', { name: 'Administrador', exact: true })).toBeVisible()
  await page.goto('/#/cadastros?subTab=locais')
  await page.getByRole('searchbox', { name: 'Buscar locais', exact: true }).fill('Almoxarifado visual')
  await page.getByTitle('Adicionar sub-local', { exact: true }).click()
  await page.getByPlaceholder('Nome do sub-local', { exact: false }).fill('Gaveta visual')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Buscar locais', exact: true }).fill('Gaveta visual')
  await expect(page.getByText('Almoxarifado visual', { exact: true })).toBeVisible()
  await expect(page.getByText('Gaveta visual', { exact: true })).toBeVisible()
})
