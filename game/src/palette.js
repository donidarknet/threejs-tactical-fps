// The look plan, in one place. Dusk at a freight relay yard: cold blue-grey steel,
// warm sodium amber, one crimson for the Jackals. Every colour in the game comes from
// here, and the same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#161b21',
  surface: '#2b333c',
  hairline: '#48525d',
  ground: '#363d45',
  ink: '#e8e4d8',
  muted: '#8b98a3',
  accent: '#f5a623',
  foe: '#d4453a',
  site: '#58b26a',
  sky: '#2c3a4a',
};

export function shade(name) {
  return PALETTE[name];
}
