import type { Block, CollectionConfig } from 'payload'

const PearBlock: Block = {
  slug: 'pears',
  fields: [
    {
      type: 'text',
      name: 'PearType',
    },
    {
      type: 'checkbox',
      name: 'showConditionalPear',
    },
    {
      type: 'text',
      name: 'ConditionalFieldPear',
      admin: {
        condition: (_, siblingData) => {
          return siblingData.showConditionalApple === true
        },
      },
    },
    { name: 'seedPear', type: 'relationship', relationTo: 'seeds', hasMany: true },
  ],
}
const AppleBlock: Block = {
  slug: 'apples',
  fields: [
    {
      type: 'text',
      name: 'AppleKind',
    },
    {
      type: 'checkbox',
      name: 'showConditionalApple',
    },
    {
      type: 'group',
      name: 'conditionalFields',
      admin: {
        condition: (_, siblingData) => {
          return siblingData.showConditionalApple === true
        },
      },
      fields: [
        {
          type: 'text',
          name: 'ConditionalFieldApple',
        },
      ],
    },

    { name: 'seedApple', type: 'relationship', relationTo: 'seeds', hasMany: true },
  ],
}

export const Fruits: CollectionConfig = {
  versions: {
    drafts: { autosave: true },
  },
  slug: 'fruits',
  fields: [
    {
      name: 'blocks',
      type: 'blocks',
      blocks: [AppleBlock, PearBlock],
    },
  ],
}

export const Seeds: CollectionConfig = {
  admin: {
    useAsTitle: 'name',
  },
  slug: 'seeds',
  fields: [
    {
      type: 'text',
      name: 'name',
    },
  ],
}
