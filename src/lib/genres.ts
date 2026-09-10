export type GenreId =
  | "trap"
  | "drill"
  | "rnb"
  | "pop"
  | "rock"
  | "punk"
  | "country"
  | "folk"
  | "house"
  | "latin"
  | "afrobeats"
  | "metal"
  | "indie"
  | "gospel";

export type Genre = {
  id: GenreId;
  label: string;
  defaultBpm: number;
  swing: number;
};

export const GENRES: Genre[] = [
  { id: "trap", label: "Trap", defaultBpm: 74, swing: 0.18 },
  { id: "drill", label: "Drill", defaultBpm: 72, swing: 0.22 },
  { id: "rnb", label: "R&B", defaultBpm: 86, swing: 0.12 },
  { id: "pop", label: "Pop", defaultBpm: 102, swing: 0.04 },
  { id: "rock", label: "Rock", defaultBpm: 128, swing: 0 },
  { id: "punk", label: "Punk", defaultBpm: 172, swing: 0 },
  { id: "country", label: "Country", defaultBpm: 96, swing: 0.08 },
  { id: "folk", label: "Folk", defaultBpm: 88, swing: 0.06 },
  { id: "house", label: "House", defaultBpm: 124, swing: 0 },
  { id: "latin", label: "Latin", defaultBpm: 98, swing: 0.1 },
  { id: "afrobeats", label: "Afrobeats", defaultBpm: 110, swing: 0.14 },
  { id: "metal", label: "Metal", defaultBpm: 148, swing: 0 },
  { id: "indie", label: "Indie", defaultBpm: 108, swing: 0.05 },
  { id: "gospel", label: "Gospel", defaultBpm: 90, swing: 0.1 },
];

export function genreById(id: string): Genre {
  return GENRES.find((g) => g.id === id) ?? GENRES[3];
}

export const SPARKS = [
  "Parking-lot fight that turns into a hookup. Filthy.",
  "I just got paid and I'm making bad decisions.",
  "Two voices arguing in a motel at 3am.",
  "Gospel choir energy, lyrics about a crime I got away with.",
  "Club song about a text I should not send.",
  "Breakup letter that turns into a flex.",
  "Night drive, windows down, somebody in the passenger seat I shouldn't have.",
];
