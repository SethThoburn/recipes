import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = resolve(__dirname, '../../../recipes');

export interface Ingredient {
  name: string;
  /** Raw amount string from the .cook file, e.g. "100g", "2", "1 cup" */
  raw: string;
  /** Numeric quantity extracted from raw, or null if not parseable */
  quantity: number | null;
  /** Unit string extracted from raw, or empty string */
  unit: string;
}

export interface Step {
  description: string;
}

export interface Recipe {
  slug: string;
  title: string;
  /** Base serving count from frontmatter */
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
}

/**
 * Minimal cooklang body parser.
 *
 * Supports:
 *   @ingredient{quantity%unit}  →  ingredient with amount "quantity unit"
 *   @ingredient{amount}         →  ingredient with raw amount string
 *   @ingredient{}               →  ingredient, no amount
 *   @ingredient                 →  single-word ingredient, no amount
 *   #cookware / ~{timer}        →  stripped from step text (not tracked)
 *   >> key: value               →  metadata (ignored here; we use frontmatter)
 */
function parseCooklang(body: string): {
  ingredients: Array<{ name: string; amount: string }>;
  steps: Array<{ description: string }>;
} {
  const ingredients: Array<{ name: string; amount: string }> = [];
  const seen = new Set<string>();
  const steps: Array<{ description: string }> = [];

  // Regex for @ingredient{...} or @word (no braces)
  const ingRe = /@([^@#~{}|\s]+)(?:\{([^}]*)\})?/g;
  // Regex for #cookware{...} or #word
  const cookwareRe = /#([^@#~{}|\s]+)(?:\{[^}]*\})?/g;
  // Regex for ~{time%unit} or ~{time}
  const timerRe = /~\{[^}]*\}/g;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;  // blank or comment
    if (line.startsWith('>>')) continue;            // metadata line

    // Extract ingredients from this step
    let match: RegExpExecArray | null;
    ingRe.lastIndex = 0;
    while ((match = ingRe.exec(line)) !== null) {
      const name = match[1].replace(/-/g, ' ').trim();
      const amountRaw = match[2] ?? '';
      // amount can be "qty%unit" or just a value
      const amount = amountRaw.includes('%')
        ? amountRaw.replace('%', '')  // "100%g" → "100g"
        : amountRaw;

      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        ingredients.push({ name, amount: amount.trim() });
      }
    }

    // Build human-readable step text by replacing cooklang tokens with plain text
    const stepText = line
      .replace(ingRe, (_, name) => name.replace(/-/g, ' '))
      .replace(cookwareRe, (_, name) => name.replace(/-/g, ' '))
      .replace(timerRe, (t) => {
        // ~{30%minutes} → "30 minutes", ~{8} → "8"
        const inner = t.slice(2, -1);
        return inner.replace('%', ' ');
      })
      .trim();

    if (stepText) steps.push({ description: stepText });
  }

  return { ingredients, steps };
}

/** Parse a raw amount string like "100g", "2 cups", "1/2" */
function parseAmount(raw: string): { quantity: number | null; unit: string } {
  if (!raw || raw.trim() === '' || raw.toLowerCase() === 'some') {
    return { quantity: null, unit: '' };
  }

  const match = raw.trim().match(/^([\d]+(?:[./][\d]+)?(?:\.\d+)?)\s*([a-zA-Z%]*)$/);
  if (!match) return { quantity: null, unit: raw.trim() };

  const numStr = match[1];
  const unit = match[2] ?? '';

  let quantity: number;
  if (numStr.includes('/')) {
    const [num, den] = numStr.split('/').map(Number);
    quantity = num / den;
  } else {
    quantity = parseFloat(numStr);
  }

  return { quantity: isNaN(quantity) ? null : quantity, unit };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseRecipeFile(filePath: string): Recipe {
  const raw = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(raw);

  const fileName = basename(filePath, '.cook');
  const title: string = frontmatter.title ?? fileName;
  const servings: number = Number(frontmatter.servings) || 1;
  const slug = slugify(title);

  const { ingredients: rawIngredients, steps } = parseCooklang(body);

  const ingredients: Ingredient[] = rawIngredients.map((ing) => {
    const { quantity, unit } = parseAmount(ing.amount);
    return { name: ing.name, raw: ing.amount, quantity, unit };
  });

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
