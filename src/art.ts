// All art is bundled (inlined) so the build is a self-contained static site.
const mods = import.meta.glob('./art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const ART = (name: string) => mods[`./art/${name}.webp`];
export const ALL_ART = () => Object.values(mods);
