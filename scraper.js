const { readFileSync } = require('fs')
const { chromium } = require('playwright')
const { QuickDB } = require('quick.db')
const { JSONDriver } = require('quick.db/out/drivers/JSONDriver')
const jsonDriver = new JSONDriver('data/anime.json')
const db = new QuickDB({ driver: jsonDriver })

main()

async function main() {
  const data = JSON.parse(readFileSync('./input.json', 'utf8'))

  await db.init()
  const browser = await chromium.launch({
    headless: true,
  })

  for (let id of data) {
    await scrape(id, browser)
  }

  await browser.close()
}

async function scrape(id, browser) {
  const existingAnime = (await db.get(id)) || {}

  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`https://myanimelist.net/anime/${id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })

  Object.assign(existingAnime, {
    title: await getTitle(page),
    episodes: {
      aired: await getAiredEpisodes(page),
      total: await getTotalEpisodes(page),
    },
  })

  await db.set(id, existingAnime)
}

async function getTitle(page) {
  const elm = page.locator('.title-name')
  const title = await elm.textContent()
  return title
}

/**
 *
 * @param {import("playwright").Page} page
 * @returns
 */
async function getTotalEpisodes(page) {
  const elm = page.locator('div#content')
  const count = await elm.evaluate(node => {
    let headings = node.querySelectorAll('h2')
    let infoHeading = Array.from(headings).find(
      h => h.textContent.toLowerCase() === 'information'
    )
    let count = 0
    let foundCount = false
    let pointer = infoHeading
    while (!foundCount) {
      if (!pointer.nextElementSibling) {
        break
      }
      pointer = pointer.nextElementSibling
      const sanitizedTextContent = pointer.textContent
        .trim()
        .split('\n')
        .join(' ')
        .replace(/\s+/, '')
      if (sanitizedTextContent.startsWith('Episodes')) {
        foundCount = true
        if (/\d+/.test(sanitizedTextContent)) {
          count = Number(sanitizedTextContent.match(/\d+/)[0])
        }
      }
    }
    return count
  })
  return count
}

/**
 *
 * @param {import("playwright").Page} page
 * @returns
 */
async function getAiredEpisodes(page) {
  const nav = page.locator('#horiznav_nav')
  await nav.evaluate(node => {
    const foundEpisodeLink = Array.from(node.querySelectorAll('a')).find(
      x => x.textContent === 'Episodes'
    )
    if (!foundEpisodeLink) return
    foundEpisodeLink.click()
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('table.episode_list')

  const elm = await page.locator('table.episode_list tbody tr')
  const count = await elm.count()
  return count
}
