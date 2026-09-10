export type Vocalist = {
  id: string;
  name: string;
  monogram: string;
  voiceId: string;
  lane: string;
  tone: string;
  delivery: "rap" | "sung" | "hybrid";
};

export const VOCALISTS: Vocalist[] = [
  {
    id: "diesel",
    name: "Diesel Kane",
    monogram: "DK",
    voiceId: "rex",
    lane: "Trap / street",
    tone: "Gravel, late-night swagger, unfiltered flex",
    delivery: "rap",
  },
  {
    id: "orion",
    name: "Orion Black",
    monogram: "OB",
    voiceId: "orion",
    lane: "Noir rap",
    tone: "Deep, cinematic, story-first",
    delivery: "rap",
  },
  {
    id: "sal",
    name: "Sal Marrow",
    monogram: "SM",
    voiceId: "sal",
    lane: "R&B",
    tone: "Velvet, close-mic, slow-burn",
    delivery: "sung",
  },
  {
    id: "nova",
    name: "Nova Voss",
    monogram: "NV",
    voiceId: "eve",
    lane: "Pop",
    tone: "Bright hook machine, can go filthy",
    delivery: "sung",
  },
  {
    id: "leo",
    name: "Leo Graves",
    monogram: "LG",
    voiceId: "leo",
    lane: "Rock",
    tone: "Grit, shouted choruses, cracked leather",
    delivery: "hybrid",
  },
  {
    id: "ara",
    name: "Ara Lane",
    monogram: "AL",
    voiceId: "ara",
    lane: "Country",
    tone: "Warm confession, whiskey, dashboard light",
    delivery: "sung",
  },
  {
    id: "helix",
    name: "Helix Cruz",
    monogram: "HC",
    voiceId: "helix",
    lane: "Latin / club",
    tone: "Body-first, dance-floor heat",
    delivery: "hybrid",
  },
  {
    id: "zagan",
    name: "Zagan Vale",
    monogram: "ZV",
    voiceId: "zagan",
    lane: "Dark / industrial",
    tone: "Menacing, theatrical, low ceiling",
    delivery: "hybrid",
  },
  {
    id: "iris",
    name: "Iris Moon",
    monogram: "IM",
    voiceId: "iris",
    lane: "Indie pop",
    tone: "Breathy, bittersweet, 2am kitchen",
    delivery: "sung",
  },
  {
    id: "atlas",
    name: "Atlas Reed",
    monogram: "AR",
    voiceId: "atlas",
    lane: "Americana",
    tone: "Outlaw gravel, long highway",
    delivery: "sung",
  },
  {
    id: "sirius",
    name: "Sirius Fox",
    monogram: "SF",
    voiceId: "sirius",
    lane: "Pop-punk",
    tone: "Smirk, chaos, spit-fast hooks",
    delivery: "hybrid",
  },
  {
    id: "carina",
    name: "Carina Sol",
    monogram: "CS",
    voiceId: "carina",
    lane: "Ballad",
    tone: "Torch-song, quiet, close",
    delivery: "sung",
  },
];

export function vocalistById(id: string | null | undefined): Vocalist {
  return VOCALISTS.find((v) => v.id === id) ?? VOCALISTS[0];
}

export function voiceIdFor(id: string): string {
  return vocalistById(id).voiceId;
}
