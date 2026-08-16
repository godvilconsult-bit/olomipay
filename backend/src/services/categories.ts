/**
 * The marketplace category tree.
 *
 * Gas is one branch here, not the platform. Categories carry an
 * `attributeSchema` describing the fields their products hold, so adding a
 * vertical — pharmacy, agro, building materials — is data, never a migration.
 *
 * Keys are stable identifiers; renaming a `name` is safe, renaming a `key` is
 * not (offers and products resolve through it).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CategorySeed {
  key: string;
  name: string;
  unitType: string;
  sortOrder: number;
  attributeSchema: Prisma.InputJsonObject;
  children?: CategorySeed[];
}

/** Most physical goods need only a brand; specifics live on the child. */
const BRAND_ONLY: Prisma.InputJsonObject = {
  type: 'object',
  required: ['brand'],
  properties: { brand: { type: 'string', title: 'Brand' } },
};

const withProps = (required: string[], properties: Record<string, unknown>): Prisma.InputJsonObject => ({
  type: 'object', required, properties: properties as Prisma.InputJsonObject,
});

export const BASE_CATEGORIES: CategorySeed[] = [
  {
    key: 'energy', name: 'Energy & Fuel', unitType: 'piece', sortOrder: 1, attributeSchema: BRAND_ONLY,
    children: [
      // The original gas catalog, now a branch rather than the whole tree.
      {
        key: 'lpg_refill', name: 'LPG Gas Refill', unitType: 'piece', sortOrder: 1,
        attributeSchema: withProps(['brand', 'sizeKg'], {
          brand:  { type: 'string', title: 'Brand' },
          sizeKg: { type: 'number', title: 'Cylinder size (kg)', enum: [6, 15, 38, 45] },
        }),
      },
      {
        key: 'lpg_cylinder', name: 'LPG Cylinder (new)', unitType: 'piece', sortOrder: 2,
        attributeSchema: withProps(['brand', 'sizeKg'], {
          brand:  { type: 'string', title: 'Brand' },
          sizeKg: { type: 'number', title: 'Cylinder size (kg)', enum: [6, 15, 38, 45] },
        }),
      },
      { key: 'lpg_accessory', name: 'Gas Accessories', unitType: 'piece', sortOrder: 3, attributeSchema: BRAND_ONLY },
      { key: 'solar',         name: 'Solar & Batteries', unitType: 'piece', sortOrder: 4, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'food', name: 'Food & Groceries', unitType: 'kg', sortOrder: 2, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'staples',    name: 'Rice, Flour & Grains', unitType: 'kg',    sortOrder: 1,
        attributeSchema: withProps(['brand'], { brand: { type: 'string', title: 'Brand' }, weightKg: { type: 'number', title: 'Pack size (kg)' } }) },
      { key: 'cooking_oil', name: 'Cooking Oil',         unitType: 'litre', sortOrder: 2,
        attributeSchema: withProps(['brand'], { brand: { type: 'string', title: 'Brand' }, volumeL: { type: 'number', title: 'Volume (L)' } }) },
      { key: 'beverages',   name: 'Drinks & Water',      unitType: 'litre', sortOrder: 3,
        attributeSchema: withProps(['brand'], { brand: { type: 'string', title: 'Brand' }, volumeL: { type: 'number', title: 'Volume (L)' } }) },
      { key: 'fresh',       name: 'Fresh Produce',       unitType: 'kg',    sortOrder: 4,
        attributeSchema: withProps([], { variety: { type: 'string', title: 'Variety' } }) },
    ],
  },
  {
    key: 'home', name: 'Home & Kitchen', unitType: 'piece', sortOrder: 3, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'cookware',   name: 'Cookware & Utensils', unitType: 'piece', sortOrder: 1, attributeSchema: BRAND_ONLY },
      { key: 'furniture',  name: 'Furniture',           unitType: 'piece', sortOrder: 2, attributeSchema: BRAND_ONLY },
      { key: 'cleaning',   name: 'Cleaning & Household', unitType: 'piece', sortOrder: 3, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'electronics', name: 'Electronics', unitType: 'piece', sortOrder: 4, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'phones',      name: 'Phones & Tablets', unitType: 'piece', sortOrder: 1,
        attributeSchema: withProps(['brand'], { brand: { type: 'string', title: 'Brand' }, model: { type: 'string', title: 'Model' }, storageGb: { type: 'number', title: 'Storage (GB)' } }) },
      { key: 'appliances',  name: 'Home Appliances',  unitType: 'piece', sortOrder: 2, attributeSchema: BRAND_ONLY },
      { key: 'accessories', name: 'Accessories',      unitType: 'piece', sortOrder: 3, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'construction', name: 'Building & Hardware', unitType: 'piece', sortOrder: 5, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'cement',    name: 'Cement & Aggregates', unitType: 'kg',    sortOrder: 1,
        attributeSchema: withProps(['brand'], { brand: { type: 'string', title: 'Brand' }, weightKg: { type: 'number', title: 'Bag size (kg)' }, grade: { type: 'string', title: 'Grade' } }) },
      { key: 'steel',     name: 'Steel & Roofing',     unitType: 'piece', sortOrder: 2, attributeSchema: BRAND_ONLY },
      { key: 'tools',     name: 'Tools & Fixings',     unitType: 'piece', sortOrder: 3, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'agriculture', name: 'Agriculture', unitType: 'kg', sortOrder: 6, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'seeds',      name: 'Seeds & Seedlings', unitType: 'kg', sortOrder: 1, attributeSchema: BRAND_ONLY },
      { key: 'fertiliser', name: 'Fertiliser & Feed', unitType: 'kg', sortOrder: 2, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'health', name: 'Health & Beauty', unitType: 'piece', sortOrder: 7, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'personal_care', name: 'Personal Care', unitType: 'piece', sortOrder: 1, attributeSchema: BRAND_ONLY },
      { key: 'baby',          name: 'Baby & Child',  unitType: 'piece', sortOrder: 2, attributeSchema: BRAND_ONLY },
    ],
  },
  {
    key: 'fashion', name: 'Fashion', unitType: 'piece', sortOrder: 8, attributeSchema: BRAND_ONLY,
    children: [
      { key: 'clothing', name: 'Clothing', unitType: 'piece', sortOrder: 1,
        attributeSchema: withProps([], { brand: { type: 'string', title: 'Brand' }, size: { type: 'string', title: 'Size' }, colour: { type: 'string', title: 'Colour' } }) },
      { key: 'footwear', name: 'Footwear', unitType: 'piece', sortOrder: 2,
        attributeSchema: withProps([], { brand: { type: 'string', title: 'Brand' }, size: { type: 'string', title: 'Size' } }) },
    ],
  },
];

/**
 * Upsert the tree. Idempotent, and safe to re-run after adding a branch —
 * existing products keep their category because keys are stable.
 */
export async function seedCategories(log: (m: string) => void = console.log): Promise<number> {
  let count = 0;

  async function upsert(node: CategorySeed, parentId: string | null): Promise<void> {
    const row = await prisma.category.upsert({
      where:  { key: node.key },
      update: { name: node.name, unitType: node.unitType, sortOrder: node.sortOrder, attributeSchema: node.attributeSchema, parentId },
      create: { key: node.key, name: node.name, unitType: node.unitType, sortOrder: node.sortOrder, attributeSchema: node.attributeSchema, parentId },
    });
    count++;
    for (const child of node.children ?? []) await upsert(child, row.id);
  }

  for (const root of BASE_CATEGORIES) await upsert(root, null);
  log(`[categories] ${count} categories ready`);
  return count;
}

/** Categories that may hold products directly — the leaves of the tree. */
export async function leafCategories() {
  const all = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const parentIds = new Set(all.map(c => c.parentId).filter(Boolean) as string[]);
  return all.filter(c => !parentIds.has(c.id));
}
