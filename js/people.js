// The two of you, and the settings you share (one merged "settings" document).

import * as store from './store.js';

export function person(slot) {
  const f = store.read(store.keyFor(slot, 'profile'), {}).fields || {};
  const fallback = slot === store.me() ? 'Me' : 'Partner';
  return { slot, name: f.name?.v || fallback, color: f.color?.v || '#5a6964', here: !!f.name };
}
export const nameOf = slot => (slot ? person(slot).name : '');
// Both of you, you first.
export const bothSlots = () => [store.me(), store.partner()];

export const DEFAULTS = {
  likes: ['Bright', 'Breezy', 'Double-glazed windows', 'Quiet', 'Tree-lined', 'Large laundry', 'Garage', 'Gas stove', 'Real exhaust (ducted outside)'],
  dislikes: ['Dark', 'Musty smell', 'Too much work', 'Loud', 'On a main road', 'No garage', 'Dark entry', 'Not very green', 'Pests'],
  amenities: ['Swimming pool', 'Spa', 'Sauna', 'Gym', 'Rooftop terrace', 'BBQ area', 'Visitor parking', 'Bike storage', 'EV charging', 'Concierge'],
};

export function settings() {
  const v = store.values('settings');
  return {
    likes: v.likes || DEFAULTS.likes,
    dislikes: v.dislikes || DEFAULTS.dislikes,
    amenities: v.amenities || DEFAULTS.amenities,
    work: { a: v.work_a || '', b: v.work_b || '' },
  };
}
export const setSetting = (key, value) => store.setField('settings', key, value);
