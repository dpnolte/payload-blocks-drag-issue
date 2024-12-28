import { test, expect, Page } from '@playwright/test'
import { getPayload, Payload, User } from 'payload'
import config from '@/payload.config'
import { Fruit, Seed } from '@/payload-types'

type Block = NonNullable<NonNullable<Fruit['blocks']>[0]>
test.describe('Payload CMS Admin Panel', () => {
  let payload: Payload
  let user: Omit<User, 'collection'>
  let fruit: Fruit
  let blockAppleA: Block
  let blockAppleB: Block
  let blockPearC: Block
  let seedsAppleA: Seed[]
  let seeesAppleB: Seed[]
  let seedsPearC: Seed[]

  test.beforeAll(async () => {
    payload = await getPayload({ config: await config })

    user = await payload.create({
      collection: 'users',
      data: {
        email: 'user@example.com',
        password: 'securePassword123',
      },
    })

    seedsAppleA = await createSeeds(payload, 'Seeds for Apple A')
    seeesAppleB = await createSeeds(payload, 'Seeds for Apple B')
    seedsPearC = await createSeeds(payload, 'Seeds for Pear C')

    fruit = await payload.create({
      collection: 'fruits',
      data: {
        blocks: [
          {
            blockName: 'Apple A With Conditional fields',
            blockType: 'apples',
            AppleKind: 'Apple With Conditional fields',
            showConditionalApple: true,
            conditionalFields: {
              ConditionalFieldApple: 'Conditiional field apple A',
            },
            seedApple: seedsAppleA,
          },
          {
            blockName: 'Apple B - without conditional field',
            blockType: 'apples',
            AppleKind: 'Apple without conditional fields',
            showConditionalApple: false,
            seedApple: seeesAppleB,
          },
          {
            blockName: 'Pear C',
            blockType: 'pears',
            PearType: 'Pear C',
            seedPear: seedsPearC,
          },
          // Add an extra dummy block so that we have a larger droppable area for the third block
          {
            blockName: 'Dummy last block to make dragging easier',
            blockType: 'pears',
            PearType: 'Dummy pear',
            seedPear: [],
          },
        ],
      },
    })
    blockAppleA = fruit.blocks![0] as any
    blockAppleB = fruit.blocks![1] as any
    blockPearC = fruit.blocks![2] as any
  })
  test.afterAll(async () => {
    await payload.delete({ collection: 'users', id: user.id })
    await payload.delete({ collection: 'fruits', id: fruit.id })
    await payload.delete({
      collection: 'seeds',
      where: { id: { in: [...seedsAppleA, ...seeesAppleB, ...seedsPearC].map((s) => s.id) } },
    })
  })

  test('should drag blocks randomly and retain data', async ({ page, baseURL, context }) => {
    await login(page, baseURL)
    await page.goto(`/admin/collections/fruits/${fruit.id}`)

    // Wait for the blocks to be loaded
    await page.waitForSelector('#field-blocks')
    // Expand all blocks first
    await expandAllBlocks(page)

    await page.waitForTimeout(500)

    const blocksIn = [blockAppleA, blockAppleB, blockPearC]
    const blocksHelper = await createBlocksHelper(page, blocksIn)

    // Simulate 3g network conditions
    const cdpSession = await context.newCDPSession(page)
    await cdpSession.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (750 * 1024) / 8,
      uploadThroughput: (250 * 1024) / 8,
      latency: 100,
      connectionType: 'cellular3g',
    })

    let blocksOut: Block[] = []
    for (let i = 0; i < 100; i++) {
      blocksOut = await blocksHelper.dragAndDropRandomBlock()
      // Create some random timings so that things can occur out of order for the race condition
      await page.waitForTimeout(Math.random() * 500)
      if (i % 10 === 0) {
        await page.waitForTimeout(2_000) // Give it some extra time to process stuff
        await verifyBlockFieldValues(page, blocksOut)
      }
    }
  })
})

async function createSeeds(payload: Payload, namePrefix: string) {
  return [
    await payload.create({
      collection: 'seeds',
      data: {
        name: `${namePrefix} - 1`,
      },
    }),
    await payload.create({
      collection: 'seeds',
      data: {
        name: `${namePrefix} - 2`,
      },
    }),
  ]
}

async function login(page: Page, baseURL: string | undefined) {
  page.goto(`${baseURL}/admin/login`)

  await page.locator('#field-email').click()

  await page.fill('#field-password', 'test')
  await page.fill('#field-email', 'test@test.nl')
  await page.click('[type=submit]')
  await page.waitForURL(`${baseURL}/admin`)

  // Verify dashboard is loaded
  await expect(page.locator('text=Dashboard')).toBeVisible()
}

async function expandAllBlocks(page: Page) {
  await page.locator('button:text("Show All")').click()
}

async function createBlocksHelper(page: Page, blocksInput: Block[]) {
  const blocks = [...blocksInput]

  const blockBox1 = await page.locator('#blocks-row-0').boundingBox()
  const draggableIconLocator = page.locator('#field-blocks .collapsible__drag').first()
  const draggableIconBox = await draggableIconLocator.boundingBox()
  const draggableIconOffsetX = draggableIconBox!.x + draggableIconBox!.width * 0.5 - blockBox1!.x

  async function dragAndDropRandomBlock() {
    const sourceBlockIndex = 1
    const possibleIndices = [0, 2]
    const targetBlockIndex = possibleIndices[Math.floor(Math.random() * possibleIndices.length)]

    const sourceDragIconLocator = page.locator(`#blocks-row-${sourceBlockIndex} .collapsible__drag`)
    const targetBlockBox = await page.locator(`#blocks-row-${targetBlockIndex}`).boundingBox()
    if (!targetBlockBox) {
      throw new Error(`Target block box ${targetBlockIndex} not found`)
    }

    // Calculate target position based on where we want to insert the block
    const target = {
      x: targetBlockBox.x + draggableIconOffsetX,
      y:
        sourceBlockIndex < targetBlockIndex
          ? targetBlockBox.y + 20 // Drop after target
          : targetBlockBox.y - 20, // Drop before target
    }

    await sourceDragIconLocator.hover()
    await page.mouse.down()
    await page.mouse.move(target.x, target.y, { steps: 2 })
    await page.mouse.up()

    // Update blocks array to match the actual DOM order
    const movedBlock = blocks[sourceBlockIndex]
    blocks.splice(sourceBlockIndex, 1)
    blocks.splice(targetBlockIndex, 0, movedBlock)

    return blocks
  }

  return {
    dragAndDropRandomBlock,
  }
}

async function verifyBlockFieldValues(page: Page, blocksOut: Block[]) {
  for (let blockIndex = 0; blockIndex < blocksOut.length; blockIndex++) {
    const block = blocksOut[blockIndex] as Block
    const namePrefix = `blocks.${blockIndex}`

    if (block.blockType === 'apples') {
      // Verify apple kind
      await expect(page.locator(`input[name="${namePrefix}.AppleKind"]`)).toHaveValue(
        block.AppleKind ?? '',
      )
      // Verify conditional field
      if (block.showConditionalApple) {
        await expect(
          page.locator(`input[name="${namePrefix}.conditionalFields.ConditionalFieldApple"]`),
        ).toHaveValue(block.conditionalFields?.ConditionalFieldApple ?? '')
      }
      // Verify seed relationships
      const seedNames = await page
        .locator(
          `#field-blocks__${blockIndex}__seedApple div[class="relationship--multi-value-label__text"]`,
        )
        .allInnerTexts()
      const seedLenth = block.seedApple?.length ?? 0
      for (let seedIndex = 0; seedIndex < seedLenth; seedIndex++) {
        const seed = block.seedApple![seedIndex] as Seed
        expect(seedNames[seedIndex]).toEqual(seed.name)
      }
    } else if (block.blockType === 'pears') {
      // Verify pear type
      await expect(page.locator(`input[name="${namePrefix}.PearType"]`)).toHaveValue(
        block.PearType ?? '',
      )
      // Verify seed relationships
      const seedNames = await page
        .locator(
          `#field-blocks__${blockIndex}__seedPear div[class="relationship--multi-value-label__text"]`,
        )
        .allInnerTexts()
      const seedLenth = block.seedPear?.length ?? 0
      for (let seedIndex = 0; seedIndex < seedLenth; seedIndex++) {
        const seed = block.seedPear![seedIndex] as Seed
        expect(seedNames[seedIndex]).toEqual(seed.name)
      }
    }
  }
}
