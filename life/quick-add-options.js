/**
 * The captures offered by Quick Add. Pure data kept apart from the sheet so routes and
 * labels can be checked in Node without a DOM. Each route hands off to a section's own
 * existing add flow; Quick Add never writes section data itself.
 */
export const QUICK_ADD_ACTIONS = Object.freeze([
    { id: 'food', label: 'Food', detail: 'Log a meal', icon: 'nutrition', section: 'nutrition', route: '#/nutrition/log' },
    { id: 'task', label: 'Task', detail: 'To-do or reminder', icon: 'calendar', section: 'tasks', route: '#/tasks/add' },
    { id: 'note', label: 'Note', detail: 'Capture a thought', icon: 'inbox', section: 'inbox', route: '#/inbox/new' },
    { id: 'journal', label: 'Journal', detail: 'Today’s check-in', icon: 'journal', section: 'journal', route: '#/journal' },
    { id: 'habit', label: 'Habit', detail: 'Start a routine', icon: 'habits', section: 'habits', route: '#/habits/new' },
    { id: 'body', label: 'Body', detail: 'Weight, sleep or steps', icon: 'body', section: 'body', route: '#/body/log' },
    { id: 'wishlist', label: 'Wishlist', detail: 'Something to buy', icon: 'wishlist', section: 'wishlist', route: '#/wishlist/new' },
    { id: 'wardrobe', label: 'Wardrobe', detail: 'Something you own', icon: 'hanger', section: 'wardrobe', route: '#/wardrobe/new' },
]);

export const quickAddAction = (id) => QUICK_ADD_ACTIONS.find((action) => action.id === id) ?? null;
