/**
 * Everyday whole foods, built in: eggs, bananas, chicken, rice, oats. They work
 * offline and instantly, with a natural portion ("1 medium egg", "1 banana"),
 * so the basics are in the app without hunting for a branded product online.
 *
 * Pure (no DOM, no storage), so the data and the search can be checked in Node.
 *
 * Values are typical averages per 100 g (or 100 ml for drinks) from standard
 * food-composition tables — what an average egg or banana is, not any one
 * shop's. Cooked and raw are separate foods because they differ a lot (rice
 * triples in weight when cooked), and the name always says which. Supermarket
 * own-brand products are different: those come from the online search, with
 * the store filter, where their real label values are.
 */

export const CATEGORIES = ['Eggs & dairy', 'Meat', 'Fish', 'Fruit', 'Veg', 'Carbs', 'Pulses & nuts', 'Oils & extras', 'Drinks'];

// name, kcal, protein g, carbs g, fat g — all per 100 g/ml — then one serving's
// weight, what to call it ("medium egg", or "a|b" for an irregular plural),
// other words people search by, and optionally 'ml' for a liquid (drinks are
// liquids by default; milk lives under dairy).
const DATA = {
    'Eggs & dairy': [
        ['Egg (whole)', 143, 12.6, 0.7, 9.5, 50, 'medium egg|medium eggs', 'eggs boiled fried poached scrambled omelette'],
        ['Egg white', 52, 10.9, 0.7, 0.2, 33, 'egg white|egg whites', 'eggs'],
        ['Milk, whole', 64, 3.4, 4.7, 3.6, 200, 'glass|glasses', 'full fat', 'ml'],
        ['Milk, semi-skimmed', 47, 3.6, 4.7, 1.7, 200, 'glass|glasses', '', 'ml'],
        ['Milk, skimmed', 34, 3.5, 4.8, 0.1, 200, 'glass|glasses', 'fat free', 'ml'],
        ['Greek yoghurt, 0% fat', 57, 10, 4, 0.2, 150, 'portion', 'yogurt fat free fage'],
        ['Greek yoghurt, full fat', 97, 9, 4, 5, 150, 'portion', 'yogurt strained'],
        ['Natural yoghurt, low fat', 56, 5, 7.5, 1.2, 125, 'pot', 'yogurt plain'],
        ['Skyr', 63, 11, 4, 0.2, 150, 'portion', 'icelandic yoghurt yogurt'],
        ['Cottage cheese', 98, 11, 3.4, 4.3, 100, 'portion', ''],
        ['Cheddar cheese', 416, 25, 0.1, 35, 30, 'portion', 'cheese mature mild'],
        ['Mozzarella', 280, 18, 1, 22, 30, 'portion', 'cheese'],
        ['Feta', 264, 14, 4, 21, 30, 'portion', 'cheese greek salad'],
        ['Halloumi', 321, 21, 2, 25, 50, 'portion', 'cheese grilling'],
        ['Parmesan', 431, 38, 4, 29, 10, 'portion', 'cheese parmigiano grana'],
        ['Butter', 735, 0.5, 0.5, 81.5, 10, 'knob|knobs', 'spread'],
    ],
    Meat: [
        ['Chicken breast (raw)', 106, 23, 0, 1.5, 150, 'breast fillet|breast fillets', 'poultry skinless'],
        ['Chicken breast (cooked)', 165, 31, 0, 3.6, 120, 'portion', 'poultry grilled roasted skinless'],
        ['Chicken thigh (raw, skinless)', 121, 19.7, 0, 4.1, 100, 'thigh|thighs', 'poultry boneless'],
        ['Chicken thigh (cooked, skinless)', 179, 24.8, 0, 8.2, 80, 'thigh|thighs', 'poultry roasted'],
        ['Turkey breast (raw)', 105, 24, 0, 1, 120, 'portion', 'poultry steak'],
        ['Beef mince, 5% fat (raw)', 125, 21, 0, 5, 125, 'portion', 'ground beef lean'],
        ['Beef mince, 12% fat (raw)', 185, 19, 0, 12, 125, 'portion', 'ground beef'],
        ['Beef mince, 20% fat (raw)', 250, 17, 0, 20, 125, 'portion', 'ground beef'],
        ['Beef steak, sirloin (raw)', 150, 21, 0, 7, 200, 'steak|steaks', 'beef'],
        ['Pork loin steak (raw)', 135, 21.5, 0, 5.5, 150, 'steak|steaks', 'pork chop'],
        ['Bacon, back (grilled)', 215, 25, 0, 12.5, 25, 'rasher|rashers', 'pork'],
        ['Pork sausages (grilled)', 278, 15, 9, 20, 45, 'sausage|sausages', 'bangers'],
        ['Ham, sliced (cooked)', 107, 18, 0.5, 3.4, 15, 'slice|slices', 'pork deli'],
    ],
    Fish: [
        ['Salmon fillet (raw)', 208, 20, 0, 13, 120, 'fillet|fillets', ''],
        ['Smoked salmon', 180, 25, 0, 8.5, 50, 'portion', ''],
        ['Cod fillet (raw)', 82, 18, 0, 0.7, 140, 'fillet|fillets', 'white fish'],
        ['Haddock fillet (raw)', 74, 17, 0, 0.6, 140, 'fillet|fillets', 'white fish'],
        ['Sea bass (raw)', 97, 18, 0, 2, 120, 'fillet|fillets', 'white fish'],
        ['Trout (raw)', 141, 20, 0, 6, 120, 'fillet|fillets', 'rainbow'],
        ['Mackerel fillet (raw)', 205, 18.6, 0, 13.9, 100, 'fillet|fillets', 'oily fish'],
        ['Tuna, canned in water', 116, 26, 0, 0.8, 112, 'tin|tins', 'drained'],
        ['Sardines, canned in oil', 208, 24.6, 0, 11.5, 90, 'tin|tins', 'drained'],
        ['Prawns (cooked)', 99, 22, 0, 0.9, 85, 'portion', 'shrimp'],
    ],
    Fruit: [
        ['Banana', 89, 1.1, 22.8, 0.3, 118, 'banana|bananas', ''],
        ['Apple', 52, 0.3, 13.8, 0.2, 180, 'apple|apples', ''],
        ['Orange', 47, 0.9, 11.8, 0.1, 130, 'orange|oranges', ''],
        ['Satsuma / clementine', 47, 0.9, 12, 0.2, 60, 'satsuma|satsumas', 'clementine mandarin easy peeler'],
        ['Grapefruit', 42, 0.8, 10.7, 0.1, 115, 'half grapefruit|half grapefruits', ''],
        ['Strawberries', 32, 0.7, 7.7, 0.3, 80, 'portion', 'berries'],
        ['Blueberries', 57, 0.7, 14.5, 0.3, 80, 'portion', 'berries'],
        ['Raspberries', 52, 1.2, 11.9, 0.7, 80, 'portion', 'berries'],
        ['Grapes', 69, 0.7, 18.1, 0.2, 80, 'portion', ''],
        ['Pear', 57, 0.4, 15.2, 0.1, 170, 'pear|pears', ''],
        ['Kiwi', 61, 1.1, 14.7, 0.5, 70, 'kiwi|kiwis', ''],
        ['Mango', 60, 0.8, 15, 0.4, 80, 'portion', ''],
        ['Pineapple', 50, 0.5, 13.1, 0.1, 80, 'portion', ''],
        ['Peach', 39, 0.9, 9.5, 0.3, 150, 'peach|peaches', 'nectarine'],
        ['Plum', 46, 0.7, 11.4, 0.3, 65, 'plum|plums', ''],
        ['Cherries', 63, 1, 16, 0.2, 80, 'portion', ''],
        ['Watermelon', 30, 0.6, 7.6, 0.2, 150, 'slice|slices', 'melon'],
        ['Melon (cantaloupe)', 34, 0.8, 8.2, 0.2, 150, 'slice|slices', 'honeydew'],
        ['Avocado', 160, 2, 8.5, 14.7, 80, 'portion', 'guacamole'],
        ['Dates (medjool)', 277, 1.8, 75, 0.2, 24, 'date|dates', 'dried fruit'],
        ['Raisins', 299, 3.1, 79.2, 0.5, 30, 'portion', 'dried fruit sultanas'],
    ],
    Veg: [
        ['Potato (boiled)', 87, 1.9, 20.1, 0.1, 150, 'portion', 'potatoes spud'],
        ['Potato (baked, jacket)', 93, 2.5, 21.2, 0.1, 200, 'jacket potato|jacket potatoes', 'potatoes spud baked'],
        ['Sweet potato (baked)', 90, 2, 20.7, 0.2, 150, 'sweet potato|sweet potatoes', 'potatoes'],
        ['Sweet potato (raw)', 86, 1.6, 20.1, 0.1, 130, 'sweet potato|sweet potatoes', 'potatoes'],
        ['Carrot (raw)', 41, 0.9, 9.6, 0.2, 80, 'portion', 'carrots'],
        ['Broccoli', 34, 2.8, 6.6, 0.4, 80, 'portion', ''],
        ['Cauliflower', 25, 1.9, 5, 0.3, 80, 'portion', ''],
        ['Spinach', 23, 2.9, 3.6, 0.4, 80, 'portion', 'greens'],
        ['Kale', 49, 4.3, 8.8, 0.9, 80, 'portion', 'greens'],
        ['Tomato', 18, 0.9, 3.9, 0.2, 120, 'tomato|tomatoes', 'cherry plum salad'],
        ['Cucumber', 15, 0.7, 3.6, 0.1, 80, 'portion', 'salad'],
        ['Pepper (red)', 31, 1, 6, 0.3, 120, 'pepper|peppers', 'bell capsicum'],
        ['Onion', 40, 1.1, 9.3, 0.1, 110, 'onion|onions', ''],
        ['Mushrooms', 22, 3.1, 3.3, 0.3, 80, 'portion', 'chestnut button'],
        ['Courgette', 17, 1.2, 3.1, 0.3, 80, 'portion', 'zucchini'],
        ['Aubergine', 25, 1, 5.9, 0.2, 100, 'portion', 'eggplant'],
        ['Peas (frozen, boiled)', 77, 5.2, 13.6, 0.4, 80, 'portion', 'garden'],
        ['Sweetcorn', 96, 3.4, 21, 1.5, 80, 'portion', 'corn'],
        ['Green beans', 31, 1.8, 7, 0.2, 80, 'portion', 'french runner'],
        ['Mixed salad leaves', 17, 1.2, 2.5, 0.3, 80, 'portion', 'lettuce rocket'],
        ['Cabbage', 25, 1.3, 5.8, 0.1, 80, 'portion', 'greens'],
        ['Asparagus', 20, 2.2, 3.9, 0.1, 80, 'portion', ''],
        ['Brussels sprouts', 43, 3.4, 9, 0.3, 80, 'portion', 'sprouts'],
        ['Parsnip', 75, 1.2, 18, 0.3, 80, 'portion', ''],
        ['Butternut squash', 45, 1, 11.7, 0.1, 80, 'portion', 'pumpkin'],
        ['Beetroot (cooked)', 44, 1.7, 10, 0.2, 80, 'portion', 'beets'],
        ['Celery', 14, 0.7, 3, 0.2, 40, 'stick|sticks', ''],
    ],
    Carbs: [
        ['Oats (porridge oats)', 372, 11, 60, 8, 40, 'portion', 'porridge rolled'],
        ['Rice, white (uncooked)', 365, 7.1, 80, 0.7, 75, 'portion', 'basmati long grain dry'],
        ['Rice, white (cooked)', 130, 2.7, 28, 0.3, 150, 'portion', 'basmati long grain boiled'],
        ['Rice, brown (uncooked)', 365, 7.5, 76, 2.7, 75, 'portion', 'dry wholegrain'],
        ['Rice, brown (cooked)', 123, 2.7, 25.6, 1, 150, 'portion', 'boiled wholegrain'],
        ['Pasta (dried)', 360, 12.5, 72, 1.5, 75, 'portion', 'spaghetti penne fusilli uncooked dry'],
        ['Pasta (cooked)', 158, 5.8, 30.9, 0.9, 180, 'portion', 'spaghetti penne fusilli boiled'],
        ['Bread, white (sliced)', 240, 8, 46, 2.5, 36, 'slice|slices', 'toast'],
        ['Bread, wholemeal (sliced)', 235, 10, 41, 3, 36, 'slice|slices', 'toast brown'],
        ['Bagel', 250, 10, 50, 1.5, 90, 'bagel|bagels', ''],
        ['Tortilla wrap', 300, 8, 51, 7, 62, 'wrap|wraps', 'fajita burrito'],
        ['Pitta bread (white)', 255, 9, 51, 1.5, 60, 'pitta|pittas', 'pita'],
        ['Couscous (dry)', 358, 12.5, 72, 1.8, 60, 'portion', ''],
        ['Quinoa (cooked)', 120, 4.4, 21.3, 1.9, 150, 'portion', ''],
        ['Weetabix', 362, 11.5, 68, 2, 19, 'biscuit|biscuits', 'cereal wheat'],
        ['Cornflakes', 378, 7, 84, 0.9, 30, 'portion', 'cereal'],
        ['Rice cake', 387, 8, 81, 2.8, 9, 'cake|cakes', 'rice cakes'],
    ],
    'Pulses & nuts': [
        ['Lentils (cooked)', 116, 9, 20, 0.4, 130, 'portion', 'pulses dal'],
        ['Chickpeas (canned, drained)', 130, 7.5, 18, 2.8, 120, 'portion', 'pulses'],
        ['Kidney beans (canned, drained)', 100, 7, 17, 0.5, 120, 'portion', 'pulses'],
        ['Baked beans', 78, 4.7, 13.6, 0.5, 200, 'half tin|half tins', 'pulses heinz haricot tomato sauce'],
        ['Hummus', 290, 7, 10, 24, 50, 'portion', 'houmous chickpea dip'],
        ['Tofu (firm)', 120, 13, 1, 7, 100, 'portion', 'soya soy'],
        ['Peanut butter (smooth)', 620, 27, 10, 52, 20, 'tbsp|tbsp', 'nut spread'],
        ['Almonds', 600, 21, 7, 53, 30, 'portion', 'nuts'],
        ['Walnuts', 654, 15, 14, 65, 30, 'portion', 'nuts'],
        ['Cashews', 553, 18, 30, 44, 30, 'portion', 'nuts'],
        ['Peanuts', 590, 26, 9, 50, 30, 'portion', 'nuts groundnuts'],
        ['Chia seeds', 486, 17, 42, 31, 15, 'tbsp|tbsp', 'seeds'],
        ['Pumpkin seeds', 559, 30, 11, 49, 30, 'portion', 'seeds'],
    ],
    'Oils & extras': [
        ['Olive oil', 900, 0, 0, 100, 13, 'tbsp|tbsp', 'cooking oil rapeseed vegetable sunflower'],
        ['Honey', 304, 0.3, 82.4, 0, 7, 'tsp|tsp', 'sugar sweetener'],
        ['Sugar (white)', 400, 0, 100, 0, 4, 'tsp|tsp', 'sweetener'],
        ['Jam', 250, 0.5, 62, 0, 15, 'tbsp|tbsp', 'preserve marmalade'],
        ['Dark chocolate (70%)', 598, 7.8, 46, 43, 10, 'square|squares', 'cocoa'],
    ],
    Drinks: [
        ['Orange juice', 45, 0.7, 10, 0.1, 150, 'glass|glasses', 'juice'],
        ['Oat milk', 46, 1, 6.7, 1.5, 200, 'glass|glasses', 'oat drink'],
        ['Almond milk (unsweetened)', 13, 0.4, 0.1, 1.1, 200, 'glass|glasses', 'nut milk'],
        ['Soya milk (unsweetened)', 33, 3.3, 0.2, 1.8, 200, 'glass|glasses', 'soy milk'],
    ],
};

const slugify = (text) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/** A table row as a food the rest of Nutrition can use unchanged (see `normalizeFood` in portions.js). */
function toFood(category, [name, kcal, proteinG, carbsG, fatG, grams, label, aliases, unit = category === 'Drinks' ? 'ml' : 'g']) {
    const names = label.includes('|') ? label.split('|') : [label, `${label}s`];
    return {
        id: `whole-${slugify(name)}`,
        source: 'whole',
        name,
        brand: null,
        category,
        aliases,
        baseUnit: unit,
        per100: { kcal, proteinG, carbsG, fatG },
        // The serving's nutrition follows from per100 and its weight.
        serving: { grams },
        servingLabel: names,
    };
}

export const WHOLE_FOODS = CATEGORIES.flatMap((category) => DATA[category].map((row) => toFood(category, row)));

// --- Search -------------------------------------------------------------------

// Equally good matches keep the order the table is written in, which puts the
// plain, common food first ("Egg (whole)" before "Egg white").
const ORDER = new Map(WHOLE_FOODS.map((food, index) => [food.id, index]));

const normalize = (text) =>
    String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/** "eggs" also tries "egg"; "tomatoes" tries "tomato" — so plurals find the singular name. */
function variants(token) {
    const out = [token];
    if (token.length > 3 && token.endsWith('es')) out.push(token.slice(0, -2));
    if (token.length > 3 && token.endsWith('s')) out.push(token.slice(0, -1));
    return out;
}

const startsAWord = (words, prefix) => words.some((word) => word.startsWith(prefix));

/**
 * 0 when the name starts with the search, 1 when each word is found at the
 * start of a word in the name, 2 when the other words people use for it
 * (aliases) are allowed to count too, 3 when each is found anywhere; null when
 * it doesn't match. Aliases only count for words of 4+ letters, so "egg" finds
 * eggs without also dragging in an aubergine (alias "eggplant"), while
 * "eggplant" still finds the aubergine.
 */
function score(food, tokens, query) {
    const name = normalize(food.name);
    const nameWords = name.split(' ');
    const allWords = `${name} ${normalize(food.aliases)}`.split(' ');
    // Judged on the form actually being matched: "eggs" is matched as "egg", which is too short.
    const aliasesCount = (v) => v.length >= 4;

    if (name.startsWith(query)) return 0;
    const each = (test) => tokens.every((token) => variants(token).some(test));
    if (each((v) => startsAWord(nameWords, v))) return 1;
    if (each((v) => startsAWord(nameWords, v) || (aliasesCount(v) && startsAWord(allWords, v)))) return 2;
    const haystack = `${name} ${normalize(food.aliases)}`;
    if (each((v) => name.includes(v) || (aliasesCount(v) && haystack.includes(v)))) return 3;
    return null;
}

/**
 * Whole foods matching `query`, best match first. `category` narrows to one
 * category. With no query it's the whole category (or nothing, with neither).
 */
export function searchWholeFoods(query, category = null) {
    const pool = category ? WHOLE_FOODS.filter((food) => food.category === category) : WHOLE_FOODS;
    const q = normalize(query);
    if (!q) return category ? [...pool].sort((a, b) => a.name.localeCompare(b.name)) : [];

    const tokens = q.split(' ');
    return pool
        .map((food) => ({ food, rank: score(food, tokens, q) }))
        .filter((item) => item.rank !== null)
        .sort((a, b) => a.rank - b.rank || ORDER.get(a.food.id) - ORDER.get(b.food.id))
        .map((item) => item.food);
}
