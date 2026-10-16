import { exerciseRole } from './prescription.js';

/**
 * Substitutes for when the exercise a plan calls for isn't available — the
 * machine is taken, the gym doesn't have it, something hurts.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node.
 *
 * A substitute has to train the *same muscle in a similar way*, so each seeded
 * exercise has a hand-written list, closest first, with a short note on what
 * changes. Where the library has no honest equivalent a list is left
 * empty rather than padded with a bad match. Exercises the app
 * has no list for — the user's own — fall back to the same muscle group and
 * the same kind of lift.
 */

// id -> [[alternative id, what changes], ...], closest first.
const CURATED = {
    // --- Chest ---
    'barbell-bench-press': [
        ['flat-dumbbell-press', 'Same press with dumbbells — freer range, kinder on the shoulders'],
        ['machine-chest-press', 'Same press on a machine — fixed path, no spotter needed'],
        ['incline-dumbbell-press', 'Tilts the work toward the upper chest'],
        ['push-up', 'Bodyweight press — easy to take close to failure anywhere'],
        ['incline-barbell-bench-press', 'Tilts the work toward the upper chest, with the same bar'],
        ['chest-dip', 'Bodyweight press — lots of lower chest and triceps'],
    ],
    'flat-dumbbell-press': [
        ['barbell-bench-press', 'Same press with a bar — easier to load heavy'],
        ['machine-chest-press', 'Same press on a machine — fixed path, no setup'],
        ['incline-dumbbell-press', 'Tilts the work toward the upper chest'],
        ['push-up', 'Bodyweight press — easy to take close to failure anywhere'],
        ['chest-dip', 'Bodyweight press — lots of lower chest and triceps'],
    ],
    'incline-dumbbell-press': [
        ['flat-dumbbell-press', 'Same press on a flat bench — more mid chest'],
        ['barbell-bench-press', 'Flat, with a bar — heavier, less upper chest'],
        ['machine-chest-press', 'Machine press — fixed path, more mid chest'],
        ['incline-barbell-bench-press', 'Same incline with a bar — heavier'],
        ['low-to-high-cable-fly', 'Upper-chest fly on cables — lighter, constant tension'],
    ],
    'machine-chest-press': [
        ['flat-dumbbell-press', 'Same press with free dumbbells — more stabiliser work'],
        ['barbell-bench-press', 'Same press with a bar — heavier, needs a bench and rack'],
        ['push-up', 'Bodyweight press — no equipment at all'],
        ['chest-dip', 'Bodyweight press — lots of lower chest and triceps'],
    ],
    'push-up': [
        ['machine-chest-press', 'Same pressing pattern on a machine — easy to load'],
        ['flat-dumbbell-press', 'Same press with dumbbells — easy to load'],
        ['barbell-bench-press', 'Same press with a bar — heavier'],
        ['chest-dip', 'Harder bodyweight press — lots of lower chest and triceps'],
    ],
    'cable-chest-fly': [
        ['pec-deck-fly', 'Same fly on a machine — fixed path, no setup'],
        ['dumbbell-fly', 'Same fly with dumbbells — hardest at the stretch'],
        ['low-to-high-cable-fly', 'Same cable fly angled up for the upper chest'],
    ],
    'pec-deck-fly': [
        ['cable-chest-fly', 'Same fly on cables — set any height, constant tension'],
        ['dumbbell-fly', 'Same fly with dumbbells — hardest at the stretch'],
        ['low-to-high-cable-fly', 'Same fly on cables, angled up for the upper chest'],
    ],
    'dumbbell-fly': [
        ['cable-chest-fly', 'Same fly on cables — constant tension through the whole range'],
        ['pec-deck-fly', 'Same fly on a machine — fixed path, easy to push hard'],
        ['low-to-high-cable-fly', 'Same fly on cables, angled up for the upper chest'],
    ],
    'incline-barbell-bench-press': [
        ['incline-dumbbell-press', 'Same incline press with dumbbells — freer range, kinder on the shoulders'],
        ['barbell-bench-press', 'Flat, with the same bar — heavier, less upper chest'],
        ['machine-chest-press', 'Machine press — fixed path, no spotter needed'],
        ['low-to-high-cable-fly', 'Upper-chest fly on cables — lighter, constant tension'],
    ],
    'chest-dip': [
        ['push-up', 'Bodyweight press — easier to scale'],
        ['machine-chest-press', 'Pressing pattern on a machine — easy to load'],
        ['flat-dumbbell-press', 'Pressing pattern with dumbbells — easy to load'],
        ['barbell-bench-press', 'Pressing pattern with a bar — heavier'],
    ],
    'low-to-high-cable-fly': [
        ['cable-chest-fly', 'Same fly at chest height — more mid chest'],
        ['pec-deck-fly', 'Same fly on a machine — fixed path, easy to push hard'],
        ['incline-dumbbell-press', 'Upper-chest press with dumbbells — heavier'],
    ],

    // --- Back ---
    'bodyweight-pull-up': [
        ['chin-up', 'Underhand grip — more biceps, usually a few reps easier'],
        ['neutral-grip-lat-pulldown', 'Same vertical pull — pick any weight, ideal if you can’t get your reps'],
        ['assisted-pull-up-machine', 'Same pull with the machine taking some of your weight'],
        ['wide-grip-lat-pulldown', 'Same vertical pull — pick any weight'],
    ],
    'chin-up': [
        ['bodyweight-pull-up', 'Overhand grip — more lats, a little harder'],
        ['neutral-grip-lat-pulldown', 'Same vertical pull — pick any weight'],
        ['assisted-pull-up-machine', 'Same pull with the machine taking some of your weight'],
        ['wide-grip-lat-pulldown', 'Same vertical pull, overhand — pick any weight'],
    ],
    'assisted-pull-up-machine': [
        ['neutral-grip-lat-pulldown', 'Same vertical pull — pick any weight'],
        ['chin-up', 'Same pull with your full bodyweight, underhand'],
        ['bodyweight-pull-up', 'Same pull with your full bodyweight, overhand'],
        ['wide-grip-lat-pulldown', 'Same vertical pull — pick any weight'],
    ],
    'neutral-grip-lat-pulldown': [
        ['bodyweight-pull-up', 'Same vertical pull, lifting your own bodyweight — harder'],
        ['chin-up', 'Same pull, underhand, lifting your own bodyweight'],
        ['assisted-pull-up-machine', 'Same pull with some of your bodyweight taken off'],
        ['wide-grip-lat-pulldown', 'Same pulldown with a wide grip — more lat stretch'],
        ['straight-arm-pulldown', 'Lats only, arms straight — lighter, no biceps'],
    ],
    'barbell-bent-over-row': [
        ['chest-supported-row', 'Same row, braced on a pad — no lower-back demand'],
        ['seated-cable-row', 'Same row seated on a cable — no lower-back demand'],
        ['one-arm-dumbbell-row', 'Same row one side at a time — more range'],
        ['pendlay-row', 'Same row from a dead stop on the floor'],
        ['t-bar-row', 'Same row on a landmine or T-bar'],
    ],
    'chest-supported-row': [
        ['seated-cable-row', 'Same row seated on a cable — constant tension'],
        ['one-arm-dumbbell-row', 'Same row, one arm at a time, on a bench'],
        ['barbell-bent-over-row', 'Same row standing — heavier, needs a strong lower back'],
        ['t-bar-row', 'Same row standing over a landmine or T-bar'],
        ['inverted-row', 'Bodyweight row, no equipment but a bar'],
    ],
    'one-arm-dumbbell-row': [
        ['chest-supported-row', 'Same row on a pad — both arms, steadier'],
        ['seated-cable-row', 'Same row seated on a cable — both arms, constant tension'],
        ['barbell-bent-over-row', 'Same row with a bar — heavier'],
        ['t-bar-row', 'Same row with both arms on a landmine or T-bar'],
        ['inverted-row', 'Bodyweight row, both arms'],
    ],
    'seated-cable-row': [
        ['chest-supported-row', 'Same row braced on a pad — a machine instead of a cable'],
        ['one-arm-dumbbell-row', 'Same row one arm at a time, on a bench'],
        ['barbell-bent-over-row', 'Same row standing — heavier, needs a strong lower back'],
        ['t-bar-row', 'Same row standing over a landmine or T-bar'],
        ['inverted-row', 'Bodyweight row, no equipment but a bar'],
    ],
    'reverse-pec-deck': [
        ['dumbbell-rear-delt-fly', 'Same rear-delt fly with dumbbells, bent over'],
        ['face-pull', 'Cable pulled to the face — rear delts and upper back'],
        ['cable-rear-delt-fly', 'Same rear-delt fly on cables — free path'],
    ],
    'dumbbell-rear-delt-fly': [
        ['reverse-pec-deck', 'Same rear-delt fly on a machine — fixed path, easier to feel'],
        ['face-pull', 'Cable pulled to the face — rear delts and upper back'],
        ['cable-rear-delt-fly', 'Same rear-delt fly on cables — constant tension'],
    ],
    'face-pull': [
        ['reverse-pec-deck', 'Rear-delt fly on a machine — fixed path'],
        ['dumbbell-rear-delt-fly', 'Rear-delt fly with dumbbells, bent over'],
        ['cable-rear-delt-fly', 'Rear-delt fly on cables — free path'],
    ],
    'wide-grip-lat-pulldown': [
        ['neutral-grip-lat-pulldown', 'Same pulldown with a neutral grip — easier on the shoulders'],
        ['bodyweight-pull-up', 'Same vertical pull, lifting your own bodyweight — harder'],
        ['assisted-pull-up-machine', 'Same pull with some of your bodyweight taken off'],
        ['straight-arm-pulldown', 'Lats only, arms straight — lighter, no biceps'],
    ],
    'straight-arm-pulldown': [
        ['wide-grip-lat-pulldown', 'Bent-arm pulldown — heavier, more biceps'],
        ['neutral-grip-lat-pulldown', 'Bent-arm pulldown — heavier, more biceps'],
    ],
    'pendlay-row': [
        ['barbell-bent-over-row', 'Same row without the floor reset — continuous tension'],
        ['t-bar-row', 'Same heavy row on a landmine or T-bar'],
        ['chest-supported-row', 'Same row braced on a pad — no lower-back demand'],
    ],
    't-bar-row': [
        ['barbell-bent-over-row', 'Same row with a straight bar'],
        ['chest-supported-row', 'Same row braced on a pad — no lower-back demand'],
        ['seated-cable-row', 'Same row seated on a cable — no lower-back demand'],
        ['pendlay-row', 'Same row from a dead stop on the floor'],
    ],
    'inverted-row': [
        ['seated-cable-row', 'Same horizontal pull on a cable — easy to load'],
        ['chest-supported-row', 'Same row on a pad — easy to load'],
        ['one-arm-dumbbell-row', 'Same row one arm at a time, on a bench'],
    ],
    // No honest same-muscle substitute in the library (the hip hinges are Legs).
    'back-extension': [],
    'cable-rear-delt-fly': [
        ['reverse-pec-deck', 'Same rear-delt fly on a machine — fixed path'],
        ['dumbbell-rear-delt-fly', 'Same rear-delt fly with dumbbells, bent over'],
        ['face-pull', 'Cable pulled to the face — rear delts and upper back'],
    ],

    // --- Shoulders ---
    'seated-dumbbell-shoulder-press': [
        ['machine-shoulder-press', 'Same press on a machine — fixed path, no balancing'],
        ['barbell-overhead-press', 'Same press standing with a bar — heavier, more core'],
        ['arnold-press', 'Same press with a rotation — a little lighter'],
    ],
    'barbell-overhead-press': [
        ['seated-dumbbell-shoulder-press', 'Same press seated with dumbbells — steadier, lighter'],
        ['machine-shoulder-press', 'Same press on a machine — fixed path, no balancing'],
        ['arnold-press', 'Same press seated with dumbbells and a rotation — lighter'],
    ],
    'machine-shoulder-press': [
        ['seated-dumbbell-shoulder-press', 'Same press with free dumbbells — more stabiliser work'],
        ['barbell-overhead-press', 'Same press standing with a bar — heavier, more core'],
        ['arnold-press', 'Same press with free dumbbells and a rotation'],
    ],
    'cable-lateral-raise': [
        ['dumbbell-lateral-raise', 'Same raise with dumbbells — hardest at the top'],
        ['machine-lateral-raise', 'Same raise on a machine — fixed path, no swinging'],
    ],
    'dumbbell-lateral-raise': [
        ['cable-lateral-raise', 'Same raise on a cable — tension all the way down'],
        ['machine-lateral-raise', 'Same raise on a machine — fixed path, no swinging'],
    ],
    'machine-lateral-raise': [
        ['cable-lateral-raise', 'Same raise on a cable — free path, tension all the way down'],
        ['dumbbell-lateral-raise', 'Same raise with dumbbells — hardest at the top'],
    ],
    'arnold-press': [
        ['seated-dumbbell-shoulder-press', 'Same press without the rotation — heavier'],
        ['machine-shoulder-press', 'Same press on a machine — fixed path, no balancing'],
        ['barbell-overhead-press', 'Same press standing with a bar — heavier, more core'],
    ],

    // --- Biceps ---
    'ez-bar-curl': [
        ['preacher-curl', 'Same bar, arms braced on a pad — stricter'],
        ['cable-bicep-curl', 'Same curl with constant cable tension'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['dumbbell-hammer-curl', 'Neutral grip — more forearm and brachialis'],
        ['dumbbell-curl', 'Dumbbells instead of a bar — each arm works alone'],
    ],
    'preacher-curl': [
        ['ez-bar-curl', 'Same bar, standing — no pad needed'],
        ['cable-bicep-curl', 'Same curl with constant cable tension'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['machine-preacher-curl', 'Same pad, on a machine'],
        ['spider-curl', 'Chest on a bench instead — a similar strict curl'],
    ],
    'incline-dumbbell-curl': [
        ['dumbbell-hammer-curl', 'Dumbbells again, neutral grip — more brachialis'],
        ['ez-bar-curl', 'A bar, standing — heavier, less stretch'],
        ['cable-bicep-curl', 'Constant cable tension'],
        ['bayesian-cable-curl', 'Arm behind the body on a cable — an even deeper stretch'],
        ['spider-curl', 'Hanging forward over a bench — a different stretch'],
    ],
    'dumbbell-hammer-curl': [
        ['incline-dumbbell-curl', 'Dumbbells on an incline — more biceps stretch'],
        ['cable-bicep-curl', 'Constant cable tension'],
        ['ez-bar-curl', 'A bar — heavier, more biceps'],
        ['rope-hammer-curl', 'Same neutral-grip curl on a cable — constant tension'],
    ],
    'cable-bicep-curl': [
        ['ez-bar-curl', 'A bar instead of a cable — heavier'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['preacher-curl', 'Arms braced on a pad — stricter'],
        ['dumbbell-hammer-curl', 'Neutral grip — more brachialis'],
        ['bayesian-cable-curl', 'Arm behind the body — a deeper stretch'],
        ['rope-hammer-curl', 'Neutral grip on a rope — more brachialis'],
    ],
    'bayesian-cable-curl': [
        ['incline-dumbbell-curl', 'Same stretched-biceps curl with dumbbells'],
        ['cable-bicep-curl', 'Same cable, standing in front of the pulley — less stretch'],
        ['spider-curl', 'Arms hanging forward over a bench — a different stretch'],
        ['preacher-curl', 'Arms braced on a pad — stricter'],
    ],
    'dumbbell-curl': [
        ['ez-bar-curl', 'A bar instead of dumbbells — heavier'],
        ['cable-bicep-curl', 'Constant cable tension'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['dumbbell-hammer-curl', 'Neutral grip — more brachialis'],
    ],
    'spider-curl': [
        ['preacher-curl', 'Arms braced on a pad — a similar strict curl'],
        ['bayesian-cable-curl', 'Arm behind the body on a cable — a deeper stretch'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['cable-bicep-curl', 'Constant cable tension'],
    ],
    'rope-hammer-curl': [
        ['dumbbell-hammer-curl', 'Same neutral-grip curl with dumbbells'],
        ['cable-bicep-curl', 'Straight bar on the cable — more biceps'],
        ['ez-bar-curl', 'A bar — heavier, more biceps'],
    ],
    'machine-preacher-curl': [
        ['preacher-curl', 'Same pad, with a free bar'],
        ['cable-bicep-curl', 'Constant cable tension'],
        ['ez-bar-curl', 'Standing with a bar — no pad needed'],
    ],

    // --- Triceps ---
    'overhead-cable-triceps-extension': [
        ['single-arm-cable-triceps-extension', 'Same overhead stretch, one arm at a time'],
        ['ez-bar-skull-crusher', 'Lying, elbows overhead — a similar stretch with a bar'],
        ['rope-triceps-pressdown', 'Pressdown instead of overhead — less stretch, easier to load'],
        ['overhead-dumbbell-triceps-extension', 'Same overhead stretch with one dumbbell'],
    ],
    'single-arm-cable-triceps-extension': [
        ['overhead-cable-triceps-extension', 'Same overhead stretch, both arms'],
        ['ez-bar-skull-crusher', 'Lying, elbows overhead — a similar stretch with a bar'],
        ['rope-triceps-pressdown', 'Pressdown instead of overhead — less stretch, easier to load'],
        ['overhead-dumbbell-triceps-extension', 'Same overhead stretch with one dumbbell'],
    ],
    'rope-triceps-pressdown': [
        ['overhead-cable-triceps-extension', 'Overhead on the same cable — a bigger stretch'],
        ['single-arm-cable-triceps-extension', 'Overhead, one arm at a time'],
        ['ez-bar-skull-crusher', 'Lying, with a bar — heavier, a bigger stretch'],
        ['straight-bar-triceps-pressdown', 'Straight bar instead of rope — a bit heavier'],
    ],
    'ez-bar-skull-crusher': [
        ['overhead-cable-triceps-extension', 'Same stretched triceps position on a cable'],
        ['single-arm-cable-triceps-extension', 'Same stretched position, one arm at a time'],
        ['rope-triceps-pressdown', 'Pressdown — less stretch, easy on the elbows'],
        ['overhead-dumbbell-triceps-extension', 'Same stretched position with a dumbbell, seated'],
    ],
    'close-grip-bench-press': [
        ['ez-bar-skull-crusher', 'Triceps on their own — lighter, no chest or shoulders'],
        ['rope-triceps-pressdown', 'Triceps on their own, on a cable'],
        ['overhead-cable-triceps-extension', 'Triceps on their own, stretched overhead'],
        ['triceps-dip', 'Bodyweight pressing — heavy triceps work'],
    ],
    'triceps-dip': [
        ['close-grip-bench-press', 'Same heavy pressing pattern on a bench'],
        ['rope-triceps-pressdown', 'Triceps on their own, on a cable — easier on the shoulders'],
        ['ez-bar-skull-crusher', 'Triceps on their own, lying — a bigger stretch'],
    ],
    'overhead-dumbbell-triceps-extension': [
        ['overhead-cable-triceps-extension', 'Same overhead stretch on a cable'],
        ['single-arm-cable-triceps-extension', 'Same overhead stretch, one arm at a time'],
        ['ez-bar-skull-crusher', 'Lying, elbows overhead — a similar stretch with a bar'],
    ],
    'straight-bar-triceps-pressdown': [
        ['rope-triceps-pressdown', 'Rope instead of a bar — spreads at the bottom'],
        ['single-arm-cable-triceps-extension', 'One arm at a time'],
        ['overhead-cable-triceps-extension', 'Overhead on the same cable — a bigger stretch'],
    ],

    // --- Forearms ---
    'wrist-curl': [
        ['reverse-wrist-curl', 'Back of the forearm instead of the front'],
        ['reverse-ez-bar-curl', 'Overhand curl — brachioradialis and the back of the forearm'],
    ],
    'reverse-wrist-curl': [
        ['wrist-curl', 'Front of the forearm instead of the back'],
        ['reverse-ez-bar-curl', 'Overhand curl — brachioradialis and the back of the forearm'],
    ],
    'reverse-ez-bar-curl': [
        ['reverse-wrist-curl', 'Back of the forearm with the wrists only'],
        ['wrist-curl', 'Front of the forearm with the wrists only'],
    ],

    // --- Legs ---
    'barbell-back-squat': [
        ['barbell-front-squat', 'Bar in front — more upright and quad-focused, needs a lighter load'],
        ['hack-squat', 'Quad-focused with your back supported — easy to push hard'],
        ['machine-leg-press', 'No balance or bracing needed — lower back out of it'],
        ['bulgarian-split-squat', 'One leg at a time — far lighter, hammers quads and glutes'],
        ['goblet-squat', 'Same pattern, much lighter — go for more reps'],
        ['walking-lunge', 'One leg at a time — far lighter, quads and glutes'],
    ],
    'barbell-front-squat': [
        ['barbell-back-squat', 'Bar on the back — heavier, a little less upright'],
        ['hack-squat', 'Quad-focused with your back supported'],
        ['machine-leg-press', 'No balance or bracing needed — heavy'],
        ['goblet-squat', 'Same upright position, much lighter — go for more reps'],
        ['bulgarian-split-squat', 'One leg at a time — far lighter'],
    ],
    'hack-squat': [
        ['machine-leg-press', 'Another machine quad press — similar load'],
        ['goblet-squat', 'Heel-elevated, free weight — much lighter, go for more reps'],
        ['bulgarian-split-squat', 'One leg at a time — far lighter, quads and glutes'],
        ['barbell-front-squat', 'Free-weight, upright squat — needs a rack'],
        ['barbell-back-squat', 'Free-weight squat — more total-body, needs a rack'],
    ],
    'machine-leg-press': [
        ['hack-squat', 'Machine squat — back supported, more upright'],
        ['barbell-back-squat', 'Free-weight squat — needs a rack and bracing'],
        ['bulgarian-split-squat', 'One leg at a time — far lighter, quads and glutes'],
        ['goblet-squat', 'Much lighter — go for more reps'],
        ['walking-lunge', 'One leg at a time — far lighter, quads and glutes'],
    ],
    'goblet-squat': [
        ['hack-squat', 'Machine squat — much heavier'],
        ['machine-leg-press', 'Machine press — much heavier'],
        ['bulgarian-split-squat', 'One leg at a time with dumbbells — harder, quads and glutes'],
        ['barbell-front-squat', 'Same upright position with a bar — much heavier'],
        ['barbell-back-squat', 'Same pattern with a bar — much heavier'],
    ],
    'bulgarian-split-squat': [
        ['goblet-squat', 'Both legs — easier to balance, heel-elevated'],
        ['machine-leg-press', 'Machine press — no balance needed, much heavier'],
        ['hack-squat', 'Machine squat — back supported'],
        ['barbell-front-squat', 'Both legs with a bar — much heavier'],
        ['walking-lunge', 'Same one-leg squat, moving — more balance'],
    ],
    'machine-leg-extension': [
        ['goblet-squat', 'Heel-elevated squat — keeps the work on the quads, but it’s a compound'],
        ['hack-squat', 'Quad-focused squat — also works the glutes'],
        ['bulgarian-split-squat', 'One-leg squat — quad-heavy, also works the glutes'],
    ],
    'romanian-deadlift-barbell': [
        ['dumbbell-romanian-deadlift', 'Same hinge with dumbbells — lighter, easier to set up'],
        ['lying-leg-curl', 'Hamstrings only — no lower-back or glute work'],
        ['seated-leg-curl', 'Hamstrings only — no lower-back or glute work'],
        ['barbell-hip-thrust', 'Glutes and hamstrings with no lower-back load'],
        ['trap-bar-deadlift', 'Hinge-and-squat from the floor — more legs'],
        ['cable-pull-through', 'Same hinge on a cable — lighter, no lower-back load'],
    ],
    'dumbbell-romanian-deadlift': [
        ['romanian-deadlift-barbell', 'Same hinge with a bar — heavier'],
        ['lying-leg-curl', 'Hamstrings only — no lower-back or glute work'],
        ['seated-leg-curl', 'Hamstrings only — no lower-back or glute work'],
        ['barbell-hip-thrust', 'Glutes and hamstrings with no lower-back load'],
        ['cable-pull-through', 'Same hinge on a cable — constant tension'],
    ],
    'conventional-deadlift': [
        ['romanian-deadlift-barbell', 'Hinge from the top — less leg drive, easier on the back'],
        ['dumbbell-romanian-deadlift', 'Hinge with dumbbells — lighter, easier to set up'],
        ['barbell-hip-thrust', 'Glutes and hamstrings with no lower-back load'],
        ['trap-bar-deadlift', 'Same lift with a trap bar — more quads, easier on the back'],
    ],
    'barbell-hip-thrust': [
        ['romanian-deadlift-barbell', 'Hip hinge — more hamstrings and lower back, less glute at the top'],
        ['dumbbell-romanian-deadlift', 'Hip hinge with dumbbells — lighter'],
        ['bulgarian-split-squat', 'One-leg squat — works the glutes hard at depth'],
        ['cable-pull-through', 'Hinge on a cable — glutes and hamstrings, no bench needed'],
        ['hip-abduction-machine', 'Outer glutes on a machine — lighter'],
    ],
    'seated-leg-curl': [
        ['lying-leg-curl', 'Same curl, lying down'],
        ['romanian-deadlift-barbell', 'Trains the hamstrings at the hip instead of the knee'],
        ['dumbbell-romanian-deadlift', 'Hamstrings at the hip, with dumbbells'],
    ],
    'lying-leg-curl': [
        ['seated-leg-curl', 'Same curl, seated — a deeper hamstring stretch'],
        ['romanian-deadlift-barbell', 'Trains the hamstrings at the hip instead of the knee'],
        ['dumbbell-romanian-deadlift', 'Hamstrings at the hip, with dumbbells'],
    ],
    'standing-calf-raise': [
        ['leg-press-calf-raise', 'Same straight-knee calf raise on the leg press'],
        ['seated-calf-raise', 'Knee bent — shifts the work to the soleus'],
    ],
    'seated-calf-raise': [
        ['standing-calf-raise', 'Knee straight — shifts the work to the gastrocnemius'],
        ['leg-press-calf-raise', 'Knee straight, on the leg press — more gastrocnemius'],
    ],
    'leg-press-calf-raise': [
        ['standing-calf-raise', 'Same straight-knee calf raise, standing'],
        ['seated-calf-raise', 'Knee bent — shifts the work to the soleus'],
    ],
    'trap-bar-deadlift': [
        ['conventional-deadlift', 'Same lift with a straight bar — more back, less quads'],
        ['romanian-deadlift-barbell', 'Hinge from the top — less leg drive, easier on the back'],
        ['barbell-hip-thrust', 'Glutes and hamstrings with no lower-back load'],
        ['machine-leg-press', 'Leg drive with no lower-back load'],
    ],
    'walking-lunge': [
        ['bulgarian-split-squat', 'Same one-leg squat, rear foot up — steadier'],
        ['goblet-squat', 'Both legs — easier to balance'],
        ['machine-leg-press', 'Machine press — no balance needed, much heavier'],
        ['barbell-hip-thrust', 'Glutes with no balance demand'],
    ],
    'cable-pull-through': [
        ['dumbbell-romanian-deadlift', 'Same hinge with dumbbells — heavier'],
        ['romanian-deadlift-barbell', 'Same hinge with a bar — heavier'],
        ['barbell-hip-thrust', 'Glutes and hamstrings with no lower-back load'],
    ],
    'hip-abduction-machine': [
        ['hip-adduction-machine', 'The opposite side — inner thigh instead of outer'],
        ['barbell-hip-thrust', 'Glutes, with a heavy load'],
        ['bulgarian-split-squat', 'One-leg squat — works the glutes hard'],
    ],
    'hip-adduction-machine': [
        ['hip-abduction-machine', 'The opposite side — outer hip instead of inner thigh'],
        ['bulgarian-split-squat', 'One-leg squat — works the inner thigh and glutes'],
        ['walking-lunge', 'Long lunge steps — inner thigh and glutes'],
    ],

    // --- Core ---
    'hanging-knee-raise': [
        ['cable-crunch', 'Weighted abs without needing a grip'],
        ['decline-sit-up', 'Bodyweight abs on a bench — add a plate to progress'],
        ['ab-wheel-rollout', 'Harder — the whole core, not just the lower abs'],
        ['hanging-leg-raise', 'Harder — straight legs, same bar'],
        ['machine-crunch', 'Weighted abs on a machine'],
    ],
    'cable-crunch': [
        ['hanging-knee-raise', 'Bodyweight abs hanging from a bar'],
        ['decline-sit-up', 'Bodyweight abs on a bench — hold a plate for load'],
        ['ab-wheel-rollout', 'Harder — the whole core, not just the abs'],
        ['machine-crunch', 'Same crunch on a machine — no setup'],
    ],
    'decline-sit-up': [
        ['cable-crunch', 'Weighted abs on a cable — easier to load precisely'],
        ['hanging-knee-raise', 'Bodyweight abs hanging from a bar'],
        ['ab-wheel-rollout', 'Harder — the whole core'],
        ['machine-crunch', 'Weighted abs on a machine'],
    ],
    'ab-wheel-rollout': [
        ['hanging-knee-raise', 'Easier — lower abs, hanging from a bar'],
        ['cable-crunch', 'Easier — weighted abs, no balance needed'],
        ['decline-sit-up', 'Easier — bodyweight abs on a bench'],
        ['hanging-leg-raise', 'Easier — lower abs, hanging from a bar'],
        ['pallof-press', 'Easier — bracing against a cable'],
    ],
    'hanging-leg-raise': [
        ['hanging-knee-raise', 'Easier — knees bent, same bar'],
        ['cable-crunch', 'Weighted abs without needing a grip'],
        ['decline-sit-up', 'Bodyweight abs on a bench — add a plate to progress'],
        ['ab-wheel-rollout', 'Harder — the whole core'],
    ],
    'machine-crunch': [
        ['cable-crunch', 'Same crunch on a cable — easy to load'],
        ['decline-sit-up', 'Bodyweight abs on a bench'],
        ['hanging-knee-raise', 'Bodyweight abs hanging from a bar'],
    ],
    'pallof-press': [
        ['cable-woodchop', 'Rotates through the trunk instead of resisting it'],
        ['ab-wheel-rollout', 'Anti-extension — the whole core'],
        ['cable-crunch', 'Weighted abs, flexing instead of bracing'],
    ],
    'cable-woodchop': [
        ['pallof-press', 'Braces against rotation instead of making it'],
        ['cable-crunch', 'Weighted abs, flexing instead of rotating'],
        ['decline-sit-up', 'Bodyweight abs on a bench'],
    ],
};

const MAX_RESULTS = 8;

/**
 * Substitutes for `exercise` from `library`, closest first, as
 * `[{ exercise, note }]`. `exclude` is ids to leave out (what's already in the
 * workout). Empty when there's nothing honest to offer.
 */
export function alternativesFor(exercise, library, exclude = []) {
    const skip = new Set([exercise.id, ...exclude]);
    const out = [];
    const add = (candidate, note) => {
        if (!candidate || skip.has(candidate.id) || out.some((o) => o.exercise.id === candidate.id)) return;
        out.push({ exercise: candidate, note });
    };

    const sameMuscle = (candidate) => exercise.muscleGroup && candidate.muscleGroup === exercise.muscleGroup;
    const sameKind = (candidate) => sameMuscle(candidate) && exerciseRole(candidate) === exerciseRole(exercise);

    const curated = CURATED[exercise.id];
    if (curated) {
        const byId = new Map(library.map((candidate) => [candidate.id, candidate]));
        curated.forEach(([id, note]) => add(byId.get(id), note));
        // The user's own exercises can be a fit for a stock one too.
        library.filter((candidate) => candidate.isCustom && sameKind(candidate)).forEach((candidate) => add(candidate, 'Your own exercise'));
    } else {
        library
            .filter(sameKind)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((candidate) => add(candidate, 'Same muscle group, same kind of lift'));
    }

    return out.slice(0, MAX_RESULTS);
}

/** Ids this module has a hand-written list for — exposed for tests. */
export const CURATED_IDS = Object.keys(CURATED);
export const curatedFor = (id) => CURATED[id]?.map(([altId, note]) => ({ id: altId, note })) ?? null;
