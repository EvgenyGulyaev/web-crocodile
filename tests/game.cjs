const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL_BASE = process.env.GAME_URL || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ headless: false });
  const errors = [];
  const contexts = await Promise.all([{}, {}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }].map(options => browser.newContext(options)));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of pages) page.on('pageerror', error => errors.push(error.message));
  try {
    await pages[0].goto(URL_BASE);
    await pages[0].locator('#name').fill('Аня');
    await pages[0].getByRole('button', { name: 'Создать комнату' }).click();
    await pages[0].locator('#invite').waitFor();
    const invite = await pages[0].locator('#invite').inputValue();
    assert.equal(new URL(invite).searchParams.size, 1, 'invitation must contain code only');
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(invite);
      await pages[i].locator('#name').fill(['Аня', 'Борис', 'Вера'][i]);
      await pages[i].getByRole('button', { name: 'Присоединиться' }).click();
      await pages[i].locator('#ready').waitFor();
    }
    await pages[0].waitForFunction(() => document.querySelector('#player-count')?.textContent === '3 / 12');
    for (const page of pages) await page.locator('#ready').click();
    for (const page of pages) await page.locator('#answer').waitFor();
    await pages[0].locator('#answer').fill('Кот катается на скейте');
    await pages[0].reload();
    await pages[0].waitForFunction(() => document.querySelector('#answer')?.value === 'Кот катается на скейте');
    console.log('PASS independent guests, invitation, readiness and text draft reload');

    for (let stage = 0; stage < 6; stage++) {
      for (let i = 0; i < 3; i++) {
        const page = pages[i];
        if (stage % 2 === 0) {
          await page.locator('#answer').waitFor();
          if (stage > 0) await page.waitForFunction(() => document.querySelector('.prompt-image img')?.naturalWidth > 0);
          await page.locator('#answer').fill(stage === 0 ? ['Кот катается на скейте', 'Крокодил на йоге', '<img src=x onerror=alert(1)>'][i] : 'Рисунок ' + stage + ' игрока ' + i);
          await page.getByRole('button', { name: 'Передать дальше' }).click();
        } else {
          const canvas = page.locator('#canvas');
          await canvas.waitFor();
          await canvas.scrollIntoViewIfNeeded();
          const box = await canvas.boundingBox();
          assert(box);
          if (i === 2) {
            const client = await contexts[i].newCDPSession(page);
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 }] });
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 }] });
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await client.detach();
          } else {
            await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, { steps: 8 });
            await page.mouse.up();
          }
          const pixels = await canvas.evaluate(node => node.toDataURL());
          assert(await canvas.evaluate(node => {
            const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data;
            return data.some((value, index) => index % 4 !== 3 && value < 200);
          }), 'drawing must produce real pixels');
          if (stage === 1 && i === 0) {
            await page.locator('#undo').click();
            await page.waitForFunction(previous => document.querySelector('canvas').toDataURL() !== previous, pixels);
            // Restore a stroke and verify it survives a real document reload.
            await canvas.scrollIntoViewIfNeeded();
            const rect = await canvas.boundingBox();
            await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
            const saved = await canvas.evaluate(node => node.toDataURL());
            await page.reload();
            await page.waitForFunction(expected => document.querySelector('canvas')?.toDataURL() === expected, saved);
          }
          await page.locator('#send-drawing').click();
        }
        if (i < 2) await page.locator('.waiting').waitFor();
      }
      console.log('PASS stage ' + (stage + 1) + '/6');
    }
    for (const page of pages) {
      await page.locator('.chains').waitFor();
      assert.equal(await page.locator('.chain').count(), 3);
      assert.equal(await page.locator('.chain-entry').count(), 18);
      await page.waitForFunction(() => [...document.querySelectorAll('.chains img')].every(image => image.naturalWidth > 0));
      assert.equal(await page.locator('img[src="x"]').count(), 0, 'text must be escaped');
    }
    await pages[0].screenshot({ path: '/tmp/crocodile-results.png', fullPage: true });
    await pages[2].screenshot({ path: '/tmp/crocodile-mobile.png', fullPage: true });
    assert(await pages[2].evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile document should not overflow horizontally');
    await pages[0].locator('#leave').click();
    await pages[1].locator('#restart').waitFor();
    assert((await pages[1].locator('.chains').innerText()).includes('Аня'), 'departed author names must remain in history');
    pages[1].once('dialog', dialog => dialog.accept());
    await pages[1].locator('#restart').click();
    await pages[1].locator('#ready').waitFor();
    await pages[2].locator('#ready').waitFor();
    assert.equal(await pages[1].locator('#player-count').innerText(), '2 / 12');
    console.log('PASS full results, images, escaped text, mobile, host transfer and restart');

    // A revoked credential offers recovery instead of leaving a frozen playing screen.
    await pages[2].route('**/api/game/rooms/*', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Сессия истекла' }) }));
    await pages[2].locator('#reset-session').waitFor({ timeout: 20_000 });
    await pages[2].locator('#reset-session').click();
    await pages[2].locator('#name').waitFor();
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS invalid session recovery; zero browser errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

