import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
  CooklangParser,
  getFlatIngredients,
  ingredient_display_name,
  cookware_display_name,
  quantity_display,
  getQuantityValue,
  getQuantityUnit,
} from '@cooklang/cooklang';
import type { CooklangRecipe, Step as CooklangStep, Content } from '@cooklang/cooklang';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = resolve(__dirname, '../../../recipes');

const parser = new CooklangParser();

export interface Ingredient {
  name: string;
  raw: string;
  quantity: number | null;
  unit: string;
  /** Set when this ingredient is a reference to another recipe */
  recipeSlug?: string;
}

export type StepItem =
  | { type: 'text'; value: string }
  | { type: 'recipe-link'; name: string; slug: string }
  | { type: 'ingredient'; name: string }
  | { type: 'cookware'; name: string }
  | { type: 'timer'; display: string; seconds: number | null };

export interface Step {
  items: StepItem[];
}

export interface Recipe {
  slug: string;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stepToItems(
  step: CooklangStep,
  recipe: CooklangRecipe,
): StepItem[] {
  return (step.items as Array<{ type: string; value?: string; index?: number }>).map((item) => {
    switch (item.type) {
      case 'text':
        return { type: 'text', value: item.value ?? '' } satisfies StepItem;
      case 'ingredient': {
        const ing = recipe.ingredients[item.index!];
        // Recipe references (@./Name{}) have a non-null `reference` field
        if (ing.reference !== null && ing.reference !== undefined) {
          const recipeName: string = ing.reference.name ?? ing.name;
          return { type: 'recipe-link', name: recipeName, slug: slugify(recipeName) } satisfies StepItem;
        }
        return { type: 'ingredient', name: ingredient_display_name(ing) } satisfies StepItem;
      }
      case 'cookware': {
        const cw = recipe.cookware[item.index!];
        return { type: 'cookware', name: cookware_display_name(cw) } satisfies StepItem;
      }
      case 'timer': {
        const tm = recipe.timers[item.index!];
        const display = tm.quantity ? quantity_display(tm.quantity) : (tm.name ?? '');
        let seconds: number | null = null;
        if (tm.quantity) {
          const qty = getQuantityValue(tm.quantity);
          const unit = (getQuantityUnit(tm.quantity) ?? '').toLowerCase();
          if (qty !== null) {
            if (unit.startsWith('h')) seconds = Math.round(qty * 3600);
            else if (unit.startsWith('s')) seconds = Math.round(qty);
            else seconds = Math.round(qty * 60); // default: minutes
          }
        }
        return { type: 'timer', display, seconds } satisfies StepItem;
      }
      default:
        return { type: 'text', value: '' } satisfies StepItem;
    }
  });
}

function parseRecipeFile(filePath: string): Recipe {
  const raw = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);

  const fileName = basename(filePath, '.cook');
  const title: string = frontmatter.title ?? fileName;
  const servings: number = Number(frontmatter.servings) || 1;
  const slug = slugify(title);

  const [recipe] = parser.parse(body);

  const ingredients: Ingredient[] = getFlatIngredients(recipe).map((ing, i) => {
    const rawIng = recipe.ingredients[i] as { reference: { name: string } | null };
    if (rawIng.reference !== null && rawIng.reference !== undefined) {
      const recipeName = rawIng.reference.name ?? ing.name;
      return { name: recipeName, raw: '', quantity: null, unit: '', recipeSlug: slugify(recipeName) };
    }
    return { name: ing.name, raw: ing.displayText ?? '', quantity: ing.quantity, unit: ing.unit ?? '' };
  });

  const steps: Step[] = recipe.sections.flatMap((section) =>
    (section.content as Content[])
      .filter((c): c is { type: 'step'; value: CooklangStep } => c.type === 'step')
      .map((c) => ({ items: stepToItems(c.value, recipe) }))
  );

  return { slug, title, servings, ingredients, steps };
}

export function getAllRecipes(): Recipe[] {
  const files = readdirSync(RECIPES_DIR).filter((f: string) => f.endsWith('.cook'));
  return files
    .map((f: string) => parseRecipeFile(join(RECIPES_DIR, f)))
    .sort((a: Recipe, b: Recipe) => a.title.localeCompare(b.title));
}

export function getRecipeBySlug(slug: string): Recipe | undefined {
  return getAllRecipes().find((r) => r.slug === slug);
}
