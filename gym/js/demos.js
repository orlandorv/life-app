/**
 * A demonstration clip for each stock exercise: the exercise's id, then the
 * YouTube video id and the channel it comes from. The comment on each line is
 * the clip's own title, there so a link can be checked against its exercise at
 * a glance.
 *
 * These are links, not copies — nothing is downloaded or hosted here, so a clip
 * needs a connection to play and it is the creator's to take down. Every one
 * was checked against YouTube when it was added (it resolves, and its title
 * names this exercise and equipment). If one goes dead, replace it here; an
 * exercise with no entry (any custom one) simply shows no demo.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node.
 */

export const DEMOS = {
    'barbell-bench-press': ['rT7DgCr-3pg', 'ScottHermanFitness'], // How To: Barbell Bench Press
    'incline-dumbbell-press': ['8iPEnn-ltC8', 'ScottHermanFitness'], // How To: Dumbbell Incline Chest Press
    'flat-dumbbell-press': ['VmB1G1K7v94', 'ScottHermanFitness'], // How To: Dumbbell Chest Press
    'cable-chest-fly': ['uJV_PE1V_PI', 'Bodybuilding.com'], // How To Do A Standing Cable Chest Fly (Proper Form)
    'pec-deck-fly': ['H4mVGHaK2f4', 'Colossus Fitness'], // How to PERFECT The Pec Deck | (CHEST FLY MISTAKES & TIPS)
    'machine-chest-press': ['xUm0BiZCWlQ', 'ScottHermanFitness'], // How To: Chest Press (Cybex)
    'push-up': ['IODxDxX7oi4', 'Calisthenicmovement'], // The Perfect Push Up | Do it right!
    'dumbbell-fly': ['eozdVDA78K0', 'ScottHermanFitness'], // How To: Dumbbell Flys On A Flat Bench
    'incline-barbell-bench-press': ['5kyLUGVq_pk', 'Colossus Fitness'], // How to PROPERLY Incline Barbell Bench Press (FIX YOUR FORM NOW)
    'chest-dip': ['dX_nSOOJIsE', 'Howcast'], // How to Do a Chest Dip | Chest Workout
    'low-to-high-cable-fly': ['eQ_NBB6OBH4', 'ScottHermanFitness'], // HOW TO: Chest "Low-To-High" Cable Fly (BIGGER UPPER CHEST) || PERFECT 
    'bodyweight-pull-up': ['vw5Xmu5CIew', 'Buff Dudes'], // How to Perform Pull Ups - Proper Pull-Up Exercise Tutorial
    'chest-supported-row': ['llFTFDwmGcw', 'Colossus Fitness'], // How to PROPERLY Incline Dumbbell Row (CHEST SUPPORTED ROW DONE RIGHT)
    'one-arm-dumbbell-row': ['pYcpY20QaE8', 'ScottHermanFitness'], // How To: Dumbbell Bent-Over Row (Single-Arm)
    'barbell-bent-over-row': ['FEFjR70BPt8', 'Kelly Matthews'], // HOW TO DO A BARBELL BENT OVER ROW | Coach Kelly Cues
    'neutral-grip-lat-pulldown': ['KgZqDuNx7rI', 'Physique Development'], // The BEST way to Perform the Neutral Grip Lat Pulldown | Form Tutorial
    'reverse-pec-deck': ['dC7jhEk-29A', 'Colossus Fitness'], // How to PROPERLY Reverse Pec Deck Fly (DO THIS)
    'chin-up': ['qV7vOUcUfD4', 'Barbell Logic'], // How To Do CHIN-UPS: Grip, Weighted Chin-Ups, Programming, & Fixing Com
    'assisted-pull-up-machine': ['wFj808u2HWU', 'PureGym'], // How To Use The Assisted Pull Up Machine
    'seated-cable-row': ['xQNrFHEMhI4', 'Bodybuilding.com'], // Seated Cable Row | Exercise Guide
    'face-pull': ['rep-qVOkqgk', 'ScottHermanFitness'], // How To: Face Pull
    'dumbbell-rear-delt-fly': ['buuYPLVXsJg', 'Colossus Fitness'], // How to PROPERLY Dumbbell Rear Delt Fly | Reverse Dumbbell Fly Tutorial
    'wide-grip-lat-pulldown': ['lueEJGjTuPQ', 'Bodybuilding.com'], // Wide-Grip Lat Pulldown | Back Exercise Guide
    'straight-arm-pulldown': ['wcVDItawocI', 'Bodybuilding.com'], // Straight Arm Pulldown - Back Exercise - Bodybuilding.com
    'pendlay-row': ['h4nkoayPFWw', 'Buff Dudes'], // How to Perform the Pendlay Row - Exercise Tutorial
    't-bar-row': ['j3Igk5nyZE4', 'ScottHermanFitness'], // How To: T-Bar Row
    'inverted-row': ['GdyhjXlxE-U', 'Colossus Fitness'], // How To PROPERLY Inverted Row For Muscle Gain
    'back-extension': ['ph3pddpKzzw', 'LIVESTRONG'], // How to Do Back Extensions
    'cable-rear-delt-fly': ['bQTWUT3Am08', 'Colossus Fitness'], // How To PROPERLY Do Cable Rear Delt Fly (TRY THIS!)
    'seated-dumbbell-shoulder-press': ['rO_iEImwHyo', 'Max Euceda'], // How to do the SEATED DUMBBELL SHOULDER PRESS! | 2 Minute Tutorial
    'cable-lateral-raise': ['Z5FA9aq3L6A', 'PureGym'], // How To Do Cable Lateral Raises
    'dumbbell-lateral-raise': ['pgrWjBfaFe8', 'Colossus Fitness'], // How to PROPERLY Dumbbell Lateral Raise For Bigger Shoulders (FIX THIS!
    'barbell-overhead-press': ['2yjwXTZQDDI', 'ScottHermanFitness'], // How To: Standing Straight-Bar Military / Overhead Press
    'machine-shoulder-press': ['3R14MnZbcpw', 'Colossus Fitness'], // How to PROPERLY Shoulder Machine Press (LEARN FAST)
    'machine-lateral-raise': ['0o07iGKUarI', 'Renaissance Periodization'], // Machine Lateral Raise
    'arnold-press': ['6Z15_WdXmVw', 'Buff Dudes'], // Arnold Press - Shoulder Exercise - Proper Form Tutorial
    'ez-bar-curl': ['aEscWJ3dS3w', 'ScottHermanFitness'], // How To: Outside-Grip EZ-Bar Curl
    'incline-dumbbell-curl': ['soxrZlIl35U', 'ScottHermanFitness'], // How To: Seated Incline Dumbbell Bicep Curl
    'preacher-curl': ['sxA__DoLsgo', 'Renaissance Periodization'], // EZ Bar Preacher Curl
    'dumbbell-hammer-curl': ['zC3nLlEvin4', 'ScottHermanFitness'], // How To: Dumbbell Hammer Curl
    'cable-bicep-curl': ['2MUEL4nL6hA', 'Colossus Fitness'], // How to PROPERLY Cable Bicep Curl For Bigger Biceps (EASY FIX)
    'bayesian-cable-curl': ['8PXe7YNOfb4', 'Leo Fanner'], // Bayesian Curls: How to in 3 MINUTES - for Maximum Bicep Growth!
    'dumbbell-curl': ['av7-8igSXTs', 'LIVESTRONG'], // How to Do Standing Dumbbell Curls
    'spider-curl': ['ke2shAeQ0O8', 'Renaissance Periodization'], // Dumbbell Spider Curl
    'rope-hammer-curl': ['1Quc_tOv97I', 'ScottHermanFitness'], // How To: Rope Hammer Curl
    'machine-preacher-curl': ['AR-oARBkYxI', 'Colossus Fitness'], // How to PROPERLY DO Machine Bicep Curls (Machine Preacher Curls)
    'overhead-cable-triceps-extension': ['57fWTQID-1Y', 'Colossus Fitness'], // How to PROPERLY Overhead Cable Tricep Extension (FIX THIS NOW!)
    'rope-triceps-pressdown': ['vB5OHsJ3EME', 'ScottHermanFitness'], // How To: Rope Push-Down
    'single-arm-cable-triceps-extension': ['sUFUQVMWdnU', 'Ryan Jewers'], // Cable Unilateral Tricep Overhead Extension (Technique)
    'ez-bar-skull-crusher': ['GaK2da6B2zM', 'Hammer Fitness'], // EZ Bar Skull Crushers: How To
    'close-grip-bench-press': ['nEF0bv2FW94', 'ScottHermanFitness'], // How To: Close-Grip Barbell Bench Press
    'triceps-dip': ['J3WYrjNDLI4', 'Nick Tumminello - Trainer of Trainers'], // The BEST Way to do Triceps Dips on Parallel Bars
    'overhead-dumbbell-triceps-extension': ['YbX7Wd8jQ-Q', 'ScottHermanFitness'], // How To: Dumbbell Seated Overhead Tricep Extension
    'straight-bar-triceps-pressdown': ['8JBHlaS7Dkk', 'Nevels Fitness'], // Tricep Pushdown with Straight Bar | TWEAK THIS!
    'wrist-curl': ['2wPpcJBe03o', 'Renaissance Periodization'], // Dumbbell Bench Wrist Curl
    'reverse-wrist-curl': ['FW7URAaC-vE', 'ScottHermanFitness'], // How To: Reverse Seated Wrist Curl
    'reverse-ez-bar-curl': ['kPXvDlFNb3s', 'ChadMollickDotCom'], // Easy Bar Reverse Curl
    'barbell-back-squat': ['Dy28eq2PjcM', 'Buff Dudes'], // How to Perform the Squat - Proper Squats Form & Technique
    'romanian-deadlift-barbell': ['3VXmecChYYM', 'Max Euceda'], // How to do the ROMANIAN DEADLIFT! | 2 Minute Tutorial
    'machine-leg-press': ['IZxyjW7MPJQ', 'ScottHermanFitness'], // How To: Seated Leg Press (Cybex)
    'hack-squat': ['0tn5K9NlCfo', 'Bodybuilding.com'], // Hack Squat | Exercise Guide
    'goblet-squat': ['lmWPn5Q-TSE', 'Fitness Lab'], // How To: Dumbbell Goblet Squat (Heels Elevated)
    'machine-leg-extension': ['YyvSfVjQeL0', 'ScottHermanFitness'], // How To: Leg Extension (Cybex)
    'seated-leg-curl': ['oFxEDkppbSQ', 'Physique Development'], // How to Seated Hamstring Machine Leg Curl | Proper Technique, Set Up, &
    'lying-leg-curl': ['jxctD6fL_FQ', 'Bodybuilding.com'], // Lying Leg Curls - Leg Exercise - Bodybuilding.com
    'standing-calf-raise': ['SVtg-1loH4c', 'Colossus Fitness'], // How to PROPERLY Standing Calf Raise | Tips & Common Mistakes
    'seated-calf-raise': ['6O5hh1rBtx8', 'Colossus Fitness'], // How to PROPERLY Calf Raise (SEATED CALF RAISE TIPS)
    'conventional-deadlift': ['r4MzxtBKyNE', "Men's Health"], // How To Perfect Your Deadlift | Form Check | Men's Health
    'barbell-front-squat': ['tlfahNdNPPI', 'ScottHermanFitness'], // How To: Front Squat (Barbell)
    'bulgarian-split-squat': ['2C-uNgKwPLE', 'ScottHermanFitness'], // How To: Bulgarian Split Squat
    'barbell-hip-thrust': ['4hYRM_60BD4', 'Kelly Matthews'], // HOW TO BARBELL HIP THRUST | Coach Kelly Cues
    'dumbbell-romanian-deadlift': ['FQKfr1YDhEk', 'ScottHermanFitness'], // How To: Dumbbell Romanian Deadlift
    'leg-press-calf-raise': ['PYZY00hI43w', 'Colossus Fitness'], // How to PROPERLY Calf Raise on The Leg Press Machine (FIX THIS!)
    'trap-bar-deadlift': ['a7sQPZsmxvA', 'Seriously Strong Training'], // Master Trap Bar Deadlifts with Perfect Form
    'walking-lunge': ['kRzcRkKy1ns', 'Kelly Matthews'], // HOW TO DO A DUMBBELL WALKING LUNGE | Coach Kelly Cues
    'cable-pull-through': ['DbSF7ipBh5Y', 'Colossus Fitness'], // How to PROPERLY Perform a Glute Pull Through | Fix Your Cable Pull Thr
    'hip-abduction-machine': ['OjI5OpV6IWA', 'Colossus Fitness'], // How to PROPERLY Use The Abductor Machine (STOP DOING THIS)
    'hip-adduction-machine': ['MLBm7i341Rw', 'Colossus Fitness'], // How to PROPERLY Use The Adductor Machine (STOP THIS NOW)
    'hanging-knee-raise': ['l7OroezzX9k', 'Runna'], // Hanging Knee Raise Tutorial - Proper Form and Technique
    'cable-crunch': ['3qjoXDTuyOE', 'Bodybuilding.com'], // Cable Crunch - Abs / Core Exercise - Bodybuilding.com
    'ab-wheel-rollout': ['rqiTPdK1c_I', 'Mind Pump TV'], // Ab Wheel- How to PROPERLY Use an Ab Wheel | MIND PUMP
    'decline-sit-up': ['QhGU5cmNZds', 'ScottHermanFitness'], // How To: Decline Sit-Up
    'hanging-leg-raise': ['Pr1ieGZ5atk', 'ATHLEAN-X'], // Hanging Leg Raise | HOW-TO
    'machine-crunch': ['_O1xunCfYEM', 'ScottHermanFitness'], // How To: Abdominal Crunch (Hammer Strength)
    'pallof-press': ['_2xWmYNnFS8', 'Colossus Fitness'], // How to Do the Pallof Press (Perfect Form for a Stronger Core)
    'cable-woodchop': ['pAplQXk3dkU', 'ScottHermanFitness'], // How To: Oblique Twist "Wood Chopper" (LF CAble)
};

/** The watch page for an exercise's demo, or null if it has none. */
export function demoUrl(exerciseId) {
    const demo = DEMOS[exerciseId];
    return demo ? `https://www.youtube.com/watch?v=${demo[0]}` : null;
}

/** A still from the demo, for a preview — or null. */
export function demoThumbnail(exerciseId) {
    const demo = DEMOS[exerciseId];
    return demo ? `https://i.ytimg.com/vi/${demo[0]}/mqdefault.jpg` : null;
}

/** Who made the demo, to credit on the link — or null. */
export function demoChannel(exerciseId) {
    return DEMOS[exerciseId]?.[1] ?? null;
}
