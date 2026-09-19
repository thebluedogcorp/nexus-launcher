// NEXUS Store catalog — curated free / open-source games that are 100% legal
// to download. Mirrors the same catalog used by the Next.js web preview.
//
// Each entry exposes one or more "download sources" (repacks) like Hydra
// Launcher. When the user picks a source, the main process streams real bytes
// to disk via the download manager (src/main/downloads/manager.ts) with
// pause/resume/cancel support.

export interface StoreSource {
  id: string;
  label: string;
  kind: "official" | "onlinefix" | "gog" | "steamrip" | "xatab" | "dodi" | "fitgirl";
  /** File size in bytes — the download manager will write exactly this many bytes. */
  sizeBytes: number;
  /** ISO date the source was uploaded. */
  uploadedAt: string;
  /** Number of seeders in the swarm (decorative). */
  seeders: number;
  /** Number of leechers in the swarm (decorative). */
  leechers: number;
  /** Quality tag e.g. "v1.4.0 · Win x64". */
  quality: string;
  /** Languages supported. */
  languages: string[];
  /** Optional magnet-style URN shown in UI for realism. */
  urn?: string;
}

export interface StoreGame {
  id: string;
  title: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  description: string;
  shortDescription: string;
  genres: string[];
  tags: string[];
  rating: number; // 0..5
  ratingCount: number;
  sizeBytes: number;
  coverImage?: string;
  bannerImage?: string;
  screenshots?: string[];
  sources: StoreSource[];
  license: "free" | "open-source" | "freeware" | "demo";
  officialUrl: string;
}

export type StoreSortKey = "trending" | "recent" | "rating" | "size" | "name";

export const STORE_SORT_LABELS: Record<StoreSortKey, string> = {
  trending: "Trending",
  recent: "Newest Uploads",
  rating: "Top Rated",
  size: "Largest First",
  name: "Name (A–Z)",
};

const DAY = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function urn(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `urn:btih:${hex}NEXUS${seed.replace(/\s+/g, "").slice(0, 12).toUpperCase()}`;
}

export const STORE_CATALOG: StoreGame[] = [
  {
    id: "supertuxkart",
    title: "SuperTuxKart",
    developer: "SuperTuxKart Team",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2007-09-22",
    description:
      "SuperTuxKart is a 3D open-source arcade racer with a variety of characters, tracks, and play modes. Take on the role of Tux or one of his friends and race across more than 20 beautifully crafted tracks, collect power-ups, dodge obstacles, and blast your opponents in single-player, split-screen or online multiplayer.",
    shortDescription:
      "Open-source kart racer with a cast of mascots, power-ups, online multiplayer and 20+ tracks.",
    genres: ["Racing", "Arcade", "Multiplayer", "Family"],
    tags: ["Open Source", "Online Multiplayer", "Split-Screen"],
    rating: 4.4,
    ratingCount: 8412,
    sizeBytes: 1_250_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/library_600x900.jpg",
    screenshots: [
      "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/ss_d36d85dbe1f8ebe89dbab1c04ffb2b1f6ee9c1df.1920x1080.jpg",
      "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/ss_99d6c2b4ec1ebc8e8ec8c5dde40fa3e22b6a5b5e.1920x1080.jpg",
    ],
    license: "open-source",
    officialUrl: "https://supertuxkart.net",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 1_250_000_000, uploadedAt: isoDaysAgo(2), seeders: 1842, leechers: 56, quality: "v1.4.0 · Win/Mac/Linux x64", languages: ["English", "Multi-12"], urn: urn("SuperTuxKart official") },
      { id: "gog", label: "GOG Games", kind: "gog", sizeBytes: 1_180_000_000, uploadedAt: isoDaysAgo(15), seeders: 920, leechers: 41, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-8"], urn: urn("SuperTuxKart gog") },
      { id: "onlinefix", label: "OnlineFix", kind: "onlinefix", sizeBytes: 1_090_000_000, uploadedAt: isoDaysAgo(28), seeders: 612, leechers: 19, quality: "Online-enabled · v1.4.0", languages: ["English", "Multi-5"], urn: urn("SuperTuxKart onlinefix") },
    ],
  },
  {
    id: "0ad",
    title: "0 A.D.",
    developer: "Wildfire Games",
    publisher: "Open Source (CC BY-SA / GPLv3)",
    releaseDate: "2002-08-10",
    description:
      "0 A.D. is a free, open-source, cross-platform real-time strategy game of ancient warfare. Pick from a dozen ancient civilizations — from the Britons to the Persians — build thriving cities, raise mighty armies, and wage war across vast procedurally-generated maps with formation-based combat and dynamic weather.",
    shortDescription:
      "Cross-platform RTS of ancient warfare. Lead the Romans, Persians, Britons and more across detailed historically-inspired maps.",
    genres: ["Real-Time Strategy", "Historical", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.2,
    ratingCount: 6230,
    sizeBytes: 2_300_000_000,
    coverImage: "https://play0ad.com/wp-content/uploads/2016/01/0ad-logo.png",
    bannerImage: "https://play0ad.com/wp-content/uploads/2016/01/0ad-logo.png",
    license: "open-source",
    officialUrl: "https://play0ad.com",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 2_300_000_000, uploadedAt: isoDaysAgo(5), seeders: 1340, leechers: 88, quality: "Alpha 26 · Win/Mac/Linux x64", languages: ["English", "Multi-20"], urn: urn("0ad official") },
      { id: "dodi", label: "DODI Repack", kind: "dodi", sizeBytes: 1_690_000_000, uploadedAt: isoDaysAgo(21), seeders: 410, leechers: 22, quality: "Compressed · Win x64", languages: ["English", "Multi-7"], urn: urn("0ad dodi") },
    ],
  },
  {
    id: "mindustry",
    title: "Mindustry",
    developer: "Anuken",
    publisher: "Anuken",
    releaseDate: "2019-09-26",
    description:
      "Mindustry is a hybrid tower-defense sandbox game. Build conveyors, mine resources, refine materials, research new tech, automate production lines, and defend your core against relentless waves of enemies across single-player campaign, sandbox, PvP and co-op multiplayer modes.",
    shortDescription:
      "Sandbox tower-defense / factory builder. Mine, refine, automate, and defend your core in single-player and online co-op.",
    genres: ["Tower Defense", "Sandbox", "Strategy", "Co-op"],
    tags: ["Open Source", "Moddable", "Online Multiplayer"],
    rating: 4.6,
    ratingCount: 12012,
    sizeBytes: 240_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1127400/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1127400/library_600x900.jpg",
    screenshots: ["https://cdn.cloudflare.steamstatic.com/steam/apps/1127400/ss_95e7b503d3d7be14d06f1f9017d3c5b6b1c3a6e2.1920x1080.jpg"],
    license: "open-source",
    officialUrl: "https://mindustrygame.github.io",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 240_000_000, uploadedAt: isoDaysAgo(1), seeders: 2304, leechers: 42, quality: "v7.0 · Win/Mac/Linux/Android", languages: ["English", "Multi-10"], urn: urn("mindustry official") },
      { id: "fitgirl", label: "FitGirl Repack", kind: "fitgirl", sizeBytes: 98_000_000, uploadedAt: isoDaysAgo(11), seeders: 1820, leechers: 71, quality: "Compressed · Win x64", languages: ["English"], urn: urn("mindustry fitgirl") },
    ],
  },
  {
    id: "openttd",
    title: "OpenTTD",
    developer: "OpenTTD Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2004-03-06",
    description:
      "OpenTTD is an open-source simulation game based upon Transport Tycoon Deluxe. Build railroads, roads, airports, and harbours; transport passengers, mail and cargo; manage finances; and grow your transport empire across procedurally-generated maps with online multiplayer support for up to 255 players.",
    shortDescription:
      "Open-source Transport Tycoon Deluxe clone. Build rail, road, sea and air networks and grow your transport empire.",
    genres: ["Simulation", "Strategy", "Sandbox"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.7,
    ratingCount: 9504,
    sizeBytes: 65_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/268010/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/268010/library_600x900.jpg",
    license: "open-source",
    officialUrl: "https://www.openttd.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 65_000_000, uploadedAt: isoDaysAgo(3), seeders: 740, leechers: 12, quality: "v14.0 · Win/Mac/Linux x64", languages: ["English", "Multi-50+"], urn: urn("openttd official") },
      { id: "gog", label: "GOG Games", kind: "gog", sizeBytes: 58_000_000, uploadedAt: isoDaysAgo(18), seeders: 510, leechers: 8, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-30"], urn: urn("openttd gog") },
    ],
  },
  {
    id: "brogue",
    title: "Brogue Community Edition",
    developer: "Brogue Community",
    publisher: "Open Source (AGPLv3)",
    releaseDate: "2009-10-15",
    description:
      "Brogue is a single-player roguelike game set deep underground. Descend through 26 procedurally-generated dungeon levels, fight monsters, discover powerful artifacts, and chain together emergent systems of fire, gas, water, lightning and acid. The Community Edition adds quality-of-life improvements, new content, and a robust save system.",
    shortDescription:
      "Classic ASCII roguelike with emergent elemental systems. Descend the dungeon, find the Amulet of Yendor, return alive.",
    genres: ["Roguelike", "Dungeon Crawler", "Turn-Based"],
    tags: ["Open Source", "Single Player", "ASCII"],
    rating: 4.5,
    ratingCount: 3120,
    sizeBytes: 18_000_000,
    license: "open-source",
    officialUrl: "https://brogue.roguelikelikes.com",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 18_000_000, uploadedAt: isoDaysAgo(7), seeders: 412, leechers: 6, quality: "v1.13 · Win/Mac/Linux", languages: ["English"], urn: urn("brogue official") },
    ],
  },
  {
    id: "shatteredpixeldungeon",
    title: "Shattered Pixel Dungeon",
    developer: "Evan Debenham",
    publisher: "Evan Debenham",
    releaseDate: "2014-08-15",
    description:
      "Shattered Pixel Dungeon is a traditional roguelike dungeon crawler with pixel-art graphics, simple but deep gameplay, and infinite replayability. Each run is procedurally-generated, every class plays differently, and the turn-based tactical combat rewards clever play over grinding.",
    shortDescription:
      "Pixel-art roguelike dungeon crawler. Choose a class, descend the dungeon, collect loot, fight bosses, die, repeat.",
    genres: ["Roguelike", "Pixel Art", "Turn-Based"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.7,
    ratingCount: 18420,
    sizeBytes: 32_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/302980/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/302980/library_600x900.jpg",
    license: "open-source",
    officialUrl: "https://shatteredpixel.com",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 32_000_000, uploadedAt: isoDaysAgo(4), seeders: 1320, leechers: 18, quality: "v2.5.2 · Win/Mac/Linux/Android", languages: ["English", "Multi-15"], urn: urn("shattered official") },
      { id: "xatab", label: "Xatab Repack", kind: "xatab", sizeBytes: 24_000_000, uploadedAt: isoDaysAgo(25), seeders: 280, leechers: 9, quality: "Repack · Win x64", languages: ["English", "Russian"], urn: urn("shattered xatab") },
    ],
  },
  {
    id: "teeworlds",
    title: "Teeworlds",
    developer: "Teeworlds Team",
    publisher: "Open Source (BSD)",
    releaseDate: "2007-04-22",
    description:
      "Teeworlds is a free, open-source sidescrolling multiplayer-only action game. Hop into cute furry Tee characters and battle with up to 64 players across deathmatch, team deathmatch and capture-the-flag modes, with built-in map editor and a thriving modding community.",
    shortDescription:
      "Sidescrolling multiplayer shooter. Pilot a Tee through fast-paced deathmatch, TDM and CTF across community-made maps.",
    genres: ["Platformer", "Multiplayer", "Action", "Shooter"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.3,
    ratingCount: 4280,
    sizeBytes: 28_000_000,
    coverImage: "https://teeworlds.com/images/teeworlds.png",
    bannerImage: "https://teeworlds.com/images/teeworlds.png",
    license: "open-source",
    officialUrl: "https://teeworlds.com",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 28_000_000, uploadedAt: isoDaysAgo(9), seeders: 580, leechers: 7, quality: "v0.7.5 · Win/Mac/Linux", languages: ["English", "Multi-12"], urn: urn("teeworlds official") },
    ],
  },
  {
    id: "wesnoth",
    title: "The Battle for Wesnoth",
    developer: "Wesnoth Community",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2003-06-18",
    description:
      "The Battle for Wesnoth is a free, open-source, turn-based tactical strategy game with a high fantasy theme. Explore vast worlds, build and lead armies of unique races and units, recruit heroes with branching advancements, and play through hundreds of community-authored campaigns and scenarios — all with hotseat and online multiplayer.",
    shortDescription:
      "Turn-based tactical strategy with high-fantasy hex combat. Hundreds of campaigns, branching unit advancements, online multiplayer.",
    genres: ["Turn-Based Strategy", "Fantasy", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.5,
    ratingCount: 8804,
    sizeBytes: 440_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/518540/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/518540/library_600x900.jpg",
    license: "open-source",
    officialUrl: "https://wesnoth.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 440_000_000, uploadedAt: isoDaysAgo(6), seeders: 920, leechers: 14, quality: "v1.18 · Win/Mac/Linux x64", languages: ["English", "Multi-50+"], urn: urn("wesnoth official") },
      { id: "gog", label: "GOG Games", kind: "gog", sizeBytes: 412_000_000, uploadedAt: isoDaysAgo(22), seeders: 612, leechers: 12, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-40"], urn: urn("wesnoth gog") },
    ],
  },
  {
    id: "veloren",
    title: "Veloren",
    developer: "Veloren Contributors",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2018-12-15",
    description:
      "Veloren is an open-source multiplayer voxel RPG written in Rust. Explore a procedurally-generated world, fight creatures, craft equipment, build structures, and quest with friends. Inspired by Cube World and Dwarf Fortress, with deep combat and a vibrant community.",
    shortDescription:
      "Open-source multiplayer voxel RPG in Rust. Explore, fight, craft, build, and quest in an infinite procedurally-generated world.",
    genres: ["RPG", "Open World", "Voxel", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Procedural"],
    rating: 4.4,
    ratingCount: 5210,
    sizeBytes: 540_000_000,
    license: "open-source",
    officialUrl: "https://veloren.net",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 540_000_000, uploadedAt: isoDaysAgo(2), seeders: 740, leechers: 28, quality: "v0.16 · Win/Mac/Linux x64", languages: ["English", "Multi-8"], urn: urn("veloren official") },
      { id: "dodi", label: "DODI Repack", kind: "dodi", sizeBytes: 412_000_000, uploadedAt: isoDaysAgo(14), seeders: 318, leechers: 11, quality: "Compressed · Win x64", languages: ["English"], urn: urn("veloren dodi") },
    ],
  },
  {
    id: "freeciv",
    title: "Freeciv",
    developer: "Freeciv Project",
    publisher: "Open Source (GPLv2)",
    releaseDate: "1996-11-14",
    description:
      "Freeciv is a free, open-source empire-building strategy game inspired by the history of human civilization. Lead your tribe from the Stone Age to the Space Age, research technologies, wage war or diplomacy, build wonders of the world, and conquer the galaxy — single-player against AI or multiplayer with up to 126 players.",
    shortDescription:
      "Free empire-building 4X strategy. Lead your civilization from Stone Age to Space Age in single-player or 126-player multiplayer.",
    genres: ["Turn-Based Strategy", "4X", "Historical", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.2,
    ratingCount: 3910,
    sizeBytes: 58_000_000,
    license: "open-source",
    officialUrl: "https://www.freeciv.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 58_000_000, uploadedAt: isoDaysAgo(8), seeders: 410, leechers: 6, quality: "v3.1 · Win/Mac/Linux", languages: ["English", "Multi-50+"], urn: urn("freeciv official") },
    ],
  },
  {
    id: "xonotic",
    title: "Xonotic",
    developer: "Xonotic Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2011-12-22",
    description:
      "Xonotic is a free and open-source arena-style first-person shooter. Combining fluid movement mechanics — bunny-hopping, strafe-jumping, ramp-sliding — with a deep weapon roster and fast-paced combat, Xonotic delivers the definitive old-school arena FPS experience in single-player bot matches and online multiplayer.",
    shortDescription:
      "Free arena FPS with fluid movement and deep weapons. Bunny-hop, strafe-jump and frag across community-hosted servers worldwide.",
    genres: ["FPS", "Arena Shooter", "Multiplayer", "Action"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.4,
    ratingCount: 6420,
    sizeBytes: 980_000_000,
    coverImage: "https://xonotic.org/xonotic-1600x900-menu.jpg",
    bannerImage: "https://xonotic.org/xonotic-1600x900-menu.jpg",
    license: "open-source",
    officialUrl: "https://xonotic.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 980_000_000, uploadedAt: isoDaysAgo(3), seeders: 920, leechers: 33, quality: "v0.8.6 · Win/Mac/Linux x64", languages: ["English", "Multi-15"], urn: urn("xonotic official") },
      { id: "onlinefix", label: "OnlineFix", kind: "onlinefix", sizeBytes: 920_000_000, uploadedAt: isoDaysAgo(20), seeders: 410, leechers: 12, quality: "Online-enabled · v0.8.6", languages: ["English"], urn: urn("xonotic onlinefix") },
    ],
  },
  {
    id: "openarena",
    title: "OpenArena",
    developer: "OpenArena Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2005-10-15",
    description:
      "OpenArena is a free, open-source content pack for the ioquake3 engine, providing a fully playable arena-style first-person shooter. Featuring fast-paced deathmatch, capture the flag, tournament modes and a roster of original characters — playable in single-player against bots or in online multiplayer.",
    shortDescription:
      "Free ioquake3-powered arena FPS. Deathmatch, CTF, tournament and more across a roster of original characters and maps.",
    genres: ["FPS", "Arena Shooter", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer"],
    rating: 4.0,
    ratingCount: 2810,
    sizeBytes: 420_000_000,
    license: "open-source",
    officialUrl: "https://openarena.ws",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 420_000_000, uploadedAt: isoDaysAgo(11), seeders: 380, leechers: 9, quality: "v0.8.8 · Win/Mac/Linux x64", languages: ["English", "Multi-5"], urn: urn("openarena official") },
    ],
  },
  {
    id: "cataclysmdda",
    title: "Cataclysm: Dark Days Ahead",
    developer: "Cataclysm DDA Contributors",
    publisher: "Open Source (CC BY-SA)",
    releaseDate: "2013-02-03",
    description:
      "Cataclysm: Dark Days Ahead is a free, open-source turn-based survival RPG set in a post-apocalyptic New England. Scavenge through procedurally-generated cities, fight zombies, mutants and worse, craft tools and weapons, build vehicles, manage hunger, thirst and morale, and survive as long as you can.",
    shortDescription:
      "Open-source post-apocalyptic survival roguelike. Scavenge, craft, build vehicles, fight the undead, and survive as long as you can.",
    genres: ["Survival", "Roguelike", "Turn-Based", "Open World"],
    tags: ["Open Source", "Single Player", "Procedural"],
    rating: 4.6,
    ratingCount: 4180,
    sizeBytes: 120_000_000,
    license: "open-source",
    officialUrl: "https://cataclysmdda.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 120_000_000, uploadedAt: isoDaysAgo(4), seeders: 612, leechers: 8, quality: "0.G · Win/Mac/Linux x64", languages: ["English", "Multi-15"], urn: urn("cataclysm official") },
      { id: "fitgirl", label: "FitGirl Repack", kind: "fitgirl", sizeBytes: 72_000_000, uploadedAt: isoDaysAgo(17), seeders: 410, leechers: 6, quality: "Compressed · Win x64", languages: ["English"], urn: urn("cataclysm fitgirl") },
    ],
  },
  {
    id: "armagetronad",
    title: "Armagetron Advanced",
    developer: "Armagetron Advanced Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2003-08-12",
    description:
      "Armagetron Advanced is a free, open-source multiplayer game inspired by the lightcycle sequences of Tron. Ride your lightcycle at insane speeds, leave impenetrable walls behind you, and force opponents to crash into them — local, online or networked multiplayer for up to 16 players.",
    shortDescription:
      "Tron-inspired multiplayer lightcycle game. Force opponents to crash into your trail at insane speeds across online servers.",
    genres: ["Action", "Multiplayer", "Arcade"],
    tags: ["Open Source", "Online Multiplayer"],
    rating: 4.1,
    ratingCount: 1920,
    sizeBytes: 22_000_000,
    license: "open-source",
    officialUrl: "https://www.armagetronad.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 22_000_000, uploadedAt: isoDaysAgo(13), seeders: 240, leechers: 4, quality: "v0.2.9 · Win/Mac/Linux", languages: ["English", "Multi-8"], urn: urn("armagetron official") },
    ],
  },
  {
    id: "hedgewars",
    title: "Hedgewars",
    developer: "Hedgewars Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2008-09-15",
    description:
      "Hedgewars is a free, open-source turn-based artillery game. Command a team of hedgehogs across wildly destructible 2D landscapes, lob an absurd arsenal of weapons — from bazookas to holy hand grenades to flying sheep — and out-think your friends in hotseat, network or AI matches.",
    shortDescription:
      "Free turn-based artillery game. Command hedgehogs across destructible landscapes with an absurd arsenal of weapons in hotseat or online.",
    genres: ["Artillery", "Turn-Based", "Multiplayer", "Comedy"],
    tags: ["Open Source", "Online Multiplayer", "Family"],
    rating: 4.3,
    ratingCount: 2810,
    sizeBytes: 220_000_000,
    license: "open-source",
    officialUrl: "https://hedgewars.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 220_000_000, uploadedAt: isoDaysAgo(5), seeders: 410, leechers: 7, quality: "v1.0.2 · Win/Mac/Linux x64", languages: ["English", "Multi-30"], urn: urn("hedgewars official") },
    ],
  },
  {
    id: "widelands",
    title: "Widelands",
    developer: "Widelands Development Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2002-04-12",
    description:
      "Widelands is a free, open-source real-time strategy game heavily inspired by Settlers II. Build a thriving economy by managing supply chains, train soldiers, expand your territory, and engage in tactical battles across beautifully hand-drawn maps — single-player campaigns, scenarios and multiplayer.",
    shortDescription:
      "Open-source Settlers II-inspired RTS. Manage complex supply chains, train armies, and expand across hand-drawn maps.",
    genres: ["Real-Time Strategy", "Economy", "City Builder"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.4,
    ratingCount: 3210,
    sizeBytes: 320_000_000,
    license: "open-source",
    officialUrl: "https://www.widelands.org",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 320_000_000, uploadedAt: isoDaysAgo(7), seeders: 410, leechers: 8, quality: "Build 21 · Win/Mac/Linux x64", languages: ["English", "Multi-20"], urn: urn("widelands official") },
    ],
  },
  {
    id: "endless-sky",
    title: "Endless Sky",
    developer: "Michael Zahniser",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2015-09-22",
    description:
      "Endless Sky is a free, open-source 2D space exploration and trading game inspired by the classic Escape Velocity series. Pilot a fleet of customizable ships, trade between star systems, fight pirates, run missions, and follow the main storyline through a sprawling galaxy.",
    shortDescription:
      "Open-source 2D space trading and exploration. Pilot a custom fleet across a sprawling galaxy, fight pirates and run missions.",
    genres: ["Space Sim", "Trading", "Open World"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.5,
    ratingCount: 4120,
    sizeBytes: 145_000_000,
    license: "open-source",
    officialUrl: "https://endless-sky.github.io",
    sources: [
      { id: "official", label: "Official", kind: "official", sizeBytes: 145_000_000, uploadedAt: isoDaysAgo(3), seeders: 580, leechers: 9, quality: "v0.10.2 · Win/Mac/Linux x64", languages: ["English", "Multi-10"], urn: urn("endless sky official") },
      { id: "gog", label: "GOG Games", kind: "gog", sizeBytes: 130_000_000, uploadedAt: isoDaysAgo(19), seeders: 318, leechers: 7, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-6"], urn: urn("endless sky gog") },
    ],
  },
];

const ALL_GENRES = Array.from(new Set(STORE_CATALOG.flatMap((g) => g.genres))).sort();
export const STORE_GENRES = ALL_GENRES;

export function findStoreGame(id: string): StoreGame | undefined {
  return STORE_CATALOG.find((g) => g.id === id);
}

export function searchStore(filters: {
  query: string;
  genre: string;
  sort: StoreSortKey;
}): StoreGame[] {
  const q = filters.query.trim().toLowerCase();
  const list = STORE_CATALOG.filter((g) => {
    if (q) {
      const hay = `${g.title} ${g.developer} ${g.genres.join(" ")} ${g.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.genre && !g.genres.includes(filters.genre)) return false;
    return true;
  });

  const sorters: Record<StoreSortKey, (a: StoreGame, b: StoreGame) => number> = {
    trending: (a, b) => (b.sources[0]?.seeders ?? 0) - (a.sources[0]?.seeders ?? 0),
    recent: (a, b) =>
      new Date(b.sources[0]?.uploadedAt ?? 0).getTime() -
      new Date(a.sources[0]?.uploadedAt ?? 0).getTime(),
    rating: (a, b) => b.rating - a.rating,
    size: (a, b) => b.sizeBytes - a.sizeBytes,
    name: (a, b) => a.title.localeCompare(b.title),
  };
  list.sort(sorters[filters.sort]);
  return list;
}
