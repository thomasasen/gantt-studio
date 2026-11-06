const {test,expect}=require('@playwright/test');

test('export entry explains PDF versus a complete single-image diagram',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await page.locator('#centralExportBtn').click();
  const entry=page.locator('#printPdfBtn');
  await expect(entry).toContainText('Diagramm / PDF exportieren');
  await expect(entry).toContainText('einzelnes PNG-/JPG-Bild');
  await entry.click();
  await expect(page.locator('#printPdfDialog h2')).toHaveText('Diagramm & Projektplan exportieren');
  await expect(page.locator('#printPdfDialog')).toContainText('gesamte Gantt-Diagramm einzeln als PNG/JPG');
  const format=page.locator('[data-print="format"]');
  const action=page.locator('[data-print-output]');
  await format.selectOption('pdf');
  await expect(action).toHaveText('PDF drucken / speichern');
  await expect(page.locator('#printOptions .print-format-hint')).toContainText('mehrseitigen Projektplan');
  await format.selectOption('png');
  await expect(action).toHaveText('PNG-Bild exportieren');
  await expect(page.locator('#printOptions .print-format-hint')).toContainText('eine PNG-Bilddatei');
  await expect(page.frameLocator('#printFrame').locator('svg[role="img"]')).toBeVisible();
  await format.selectOption('jpg');
  await expect(action).toHaveText('JPG-Bild exportieren');
  await expect(page.locator('#printOptions .print-format-hint')).toContainText('eine JPG-Bilddatei');
  await expect(page.locator('[data-print="jpegQuality"]')).toBeVisible();
  await format.selectOption('pdf');
  await expect(action).toHaveText('PDF drucken / speichern');
  await expect(page.frameLocator('#printFrame').locator('.sheet').first()).toBeVisible();
});
