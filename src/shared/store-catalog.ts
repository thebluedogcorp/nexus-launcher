// NEXUS Store catalog — curated free / open-source games that are 100% legal
// to download. Mirrors the same catalog used by the Next.js web preview.
//
// Each entry exposes one or more "repacks" (download sources) like Hydra
// Launcher. When the user picks a repack, the main process streams real bytes
// to disk via the download manager (src/main/downloads/manager.ts) with
// pause/resume/cancel support.
//
// Terminology follows Hydra Launcher:
//   - "repack"     = a single downloadable variant of a game (e.g. "FitGirl · v1.4.0")
//   - "source"     = the repacker site (FitGirl, OnlineFix, GOG, Xatab, DODI, …)
//   - "uris"       = the magnet/HTTP URIs the repack can be fetched from
//   - "unavailableUris" = uris that are currently offline (for the availability orb)

export interface StoreRepack {
  id: string;
  /** Display title — e.g. "FitGirl · v1.4.0 · Win x64". */
  title: string;
  /** Reacker site id — drives the badge color in the UI. */
  kind: "official" | "onlinefix" | "gog" | "steamrip" | "xatab" | "dodi" | "fitgirl";
  /** Reacker site display name — e.g. "FitGirl", "OnlineFix". */
  downloadSourceName: string;
  /** File size in bytes — the download manager will write exactly this many bytes. */
  fileSize: number;
  /** ISO date the repack was uploaded. */
  uploadDate: string;
  /** ISO date the repack record was created in our catalog (for "New" badge logic). */
  createdAt: string;
  /** Number of seeders in the swarm (decorative). */
  seeders: number;
  /** Number of leechers in the swarm (decorative). */
  leechers: number;
  /** Quality tag e.g. "v1.4.0 · Win x64". */
  quality: string;
  /** Languages supported. */
  languages: string[];
  /** Magnet-style URIs the repack can be fetched from (decorative). */
  uris: string[];
  /** Subset of `uris` that are currently offline — drives the availability orb color. */
  unavailableUris: string[];
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
  heroImage?: string; // wide hero image for the detail page
  logoImage?: string; // transparent Steam-style logo PNG
  screenshots?: string[];
  repacks: StoreRepack[];
  license: "free" | "open-source" | "freeware" | "demo";
  officialUrl: string;
}

export type StoreSortKey = "popularity" | "newest" | "oldest" | "az" | "za" | "rating_high" | "rating_low";

export const STORE_SORT_LABELS: Record<StoreSortKey, string> = {
  popularity: "Popularity",
  newest: "Newest releases",
  oldest: "Oldest releases",
  az: "Title (A-Z)",
  za: "Title (Z-A)",
  rating_high: "Highest rating",
  rating_low: "Lowest rating",
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
  return `magnet:?xt=urn:btih:${hex}${seed.replace(/\s+/g, "").slice(0, 32).toUpperCase()}`;
}

// Helper to build a repack with sensible defaults.
function repack(
  id: string,
  title: string,
  kind: StoreRepack["kind"],
  downloadSourceName: string,
  fileSize: number,
  uploadedDaysAgo: number,
  opts: Partial<Pick<StoreRepack, "seeders" | "leechers" | "quality" | "languages" | "uris" | "unavailableUris">> = {},
): StoreRepack {
  const baseUrn = urn(`${id}-${kind}`);
  return {
    id,
    title,
    kind,
    downloadSourceName,
    fileSize,
    uploadDate: isoDaysAgo(uploadedDaysAgo),
    createdAt: isoDaysAgo(uploadedDaysAgo),
    seeders: opts.seeders ?? 500,
    leechers: opts.leechers ?? 20,
    quality: opts.quality ?? "Win x64",
    languages: opts.languages ?? ["English"],
    uris: opts.uris ?? [baseUrn, `https://${kind}.nexus-store.local/${id}`],
    unavailableUris: opts.unavailableUris ?? [],
  };
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
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/library_hero.jpg",
    screenshots: [
      "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/ss_d36d85dbe1f8ebe89dbab1c04ffb2b1f6ee9c1df.1920x1080.jpg",
      "https://cdn.cloudflare.steamstatic.com/steam/apps/391940/ss_99d6c2b4ec1ebc8e8ec8c5dde40fa3e22b6a5b5e.1920x1080.jpg",
    ],
    license: "open-source",
    officialUrl: "https://supertuxkart.net",
    repacks: [
      repack("stk-official", "Official · v1.4.0 · Win/Mac/Linux x64", "official", "Official", 1_250_000_000, 2, { seeders: 1842, leechers: 56, quality: "v1.4.0 · Win/Mac/Linux x64", languages: ["English", "Multi-12"] }),
      repack("stk-gog", "GOG Goodie Pack · Win x64", "gog", "GOG Games", 1_180_000_000, 15, { seeders: 920, leechers: 41, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-8"] }),
      repack("stk-onlinefix", "OnlineFix · Online-enabled v1.4.0", "onlinefix", "OnlineFix", 1_090_000_000, 28, { seeders: 612, leechers: 19, quality: "Online-enabled · v1.4.0", languages: ["English", "Multi-5"] }),
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
    heroImage: "https://play0ad.com/wp-content/uploads/2016/01/0ad-logo.png",
    license: "open-source",
    officialUrl: "https://play0ad.com",
    repacks: [
      repack("0ad-official", "Official · Alpha 26 · Win/Mac/Linux x64", "official", "Official", 2_300_000_000, 5, { seeders: 1340, leechers: 88, quality: "Alpha 26 · Win/Mac/Linux x64", languages: ["English", "Multi-20"] }),
      repack("0ad-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 1_690_000_000, 21, { seeders: 410, leechers: 22, quality: "Compressed · Win x64", languages: ["English", "Multi-7"] }),
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
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1127400/library_hero.jpg",
    screenshots: ["https://cdn.cloudflare.steamstatic.com/steam/apps/1127400/ss_95e7b503d3d7be14d06f1f9017d3c5b6b1c3a6e2.1920x1080.jpg"],
    license: "open-source",
    officialUrl: "https://mindustrygame.github.io",
    repacks: [
      repack("mindustry-official", "Official · v7.0 · Win/Mac/Linux/Android", "official", "Official", 240_000_000, 1, { seeders: 2304, leechers: 42, quality: "v7.0 · Win/Mac/Linux/Android", languages: ["English", "Multi-10"] }),
      repack("mindustry-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 98_000_000, 11, { seeders: 1820, leechers: 71, quality: "Compressed · Win x64", languages: ["English"] }),
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
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/268010/library_hero.jpg",
    license: "open-source",
    officialUrl: "https://www.openttd.org",
    repacks: [
      repack("openttd-official", "Official · v14.0 · Win/Mac/Linux x64", "official", "Official", 65_000_000, 3, { seeders: 740, leechers: 12, quality: "v14.0 · Win/Mac/Linux x64", languages: ["English", "Multi-50+"] }),
      repack("openttd-gog", "GOG Goodie Pack · Win x64", "gog", "GOG Games", 58_000_000, 18, { seeders: 510, leechers: 8, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-30"] }),
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
    repacks: [
      repack("brogue-official", "Official · v1.13 · Win/Mac/Linux", "official", "Official", 18_000_000, 7, { seeders: 412, leechers: 6, quality: "v1.13 · Win/Mac/Linux", languages: ["English"] }),
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
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/302980/library_hero.jpg",
    license: "open-source",
    officialUrl: "https://shatteredpixel.com",
    repacks: [
      repack("shattered-official", "Official · v2.5.2 · Win/Mac/Linux/Android", "official", "Official", 32_000_000, 4, { seeders: 1320, leechers: 18, quality: "v2.5.2 · Win/Mac/Linux/Android", languages: ["English", "Multi-15"] }),
      repack("shattered-xatab", "Xatab Repack · Win x64", "xatab", "Xatab", 24_000_000, 25, { seeders: 280, leechers: 9, quality: "Repack · Win x64", languages: ["English", "Russian"] }),
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
    heroImage: "https://teeworlds.com/images/teeworlds.png",
    license: "open-source",
    officialUrl: "https://teeworlds.com",
    repacks: [
      repack("teeworlds-official", "Official · v0.7.5 · Win/Mac/Linux", "official", "Official", 28_000_000, 9, { seeders: 580, leechers: 7, quality: "v0.7.5 · Win/Mac/Linux", languages: ["English", "Multi-12"] }),
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
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/518540/library_hero.jpg",
    license: "open-source",
    officialUrl: "https://wesnoth.org",
    repacks: [
      repack("wesnoth-official", "Official · v1.18 · Win/Mac/Linux x64", "official", "Official", 440_000_000, 6, { seeders: 920, leechers: 14, quality: "v1.18 · Win/Mac/Linux x64", languages: ["English", "Multi-50+"] }),
      repack("wesnoth-gog", "GOG Goodie Pack · Win x64", "gog", "GOG Games", 412_000_000, 22, { seeders: 612, leechers: 12, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-40"] }),
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
    repacks: [
      repack("veloren-official", "Official · v0.16 · Win/Mac/Linux x64", "official", "Official", 540_000_000, 2, { seeders: 740, leechers: 28, quality: "v0.16 · Win/Mac/Linux x64", languages: ["English", "Multi-8"] }),
      repack("veloren-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 412_000_000, 14, { seeders: 318, leechers: 11, quality: "Compressed · Win x64", languages: ["English"] }),
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
    repacks: [
      repack("freeciv-official", "Official · v3.1 · Win/Mac/Linux", "official", "Official", 58_000_000, 8, { seeders: 410, leechers: 6, quality: "v3.1 · Win/Mac/Linux", languages: ["English", "Multi-50+"] }),
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
    heroImage: "https://xonotic.org/xonotic-1600x900-menu.jpg",
    license: "open-source",
    officialUrl: "https://xonotic.org",
    repacks: [
      repack("xonotic-official", "Official · v0.8.6 · Win/Mac/Linux x64", "official", "Official", 980_000_000, 3, { seeders: 920, leechers: 33, quality: "v0.8.6 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("xonotic-onlinefix", "OnlineFix · Online-enabled v0.8.6", "onlinefix", "OnlineFix", 920_000_000, 20, { seeders: 410, leechers: 12, quality: "Online-enabled · v0.8.6", languages: ["English"] }),
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
    repacks: [
      repack("openarena-official", "Official · v0.8.8 · Win/Mac/Linux x64", "official", "Official", 420_000_000, 11, { seeders: 380, leechers: 9, quality: "v0.8.8 · Win/Mac/Linux x64", languages: ["English", "Multi-5"] }),
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
    repacks: [
      repack("cataclysm-official", "Official · 0.G · Win/Mac/Linux x64", "official", "Official", 120_000_000, 4, { seeders: 612, leechers: 8, quality: "0.G · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("cataclysm-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 72_000_000, 17, { seeders: 410, leechers: 6, quality: "Compressed · Win x64", languages: ["English"] }),
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
    repacks: [
      repack("armagetron-official", "Official · v0.2.9 · Win/Mac/Linux", "official", "Official", 22_000_000, 13, { seeders: 240, leechers: 4, quality: "v0.2.9 · Win/Mac/Linux", languages: ["English", "Multi-8"] }),
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
    repacks: [
      repack("hedgewars-official", "Official · v1.0.2 · Win/Mac/Linux x64", "official", "Official", 220_000_000, 5, { seeders: 410, leechers: 7, quality: "v1.0.2 · Win/Mac/Linux x64", languages: ["English", "Multi-30"] }),
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
    repacks: [
      repack("widelands-official", "Official · Build 21 · Win/Mac/Linux x64", "official", "Official", 320_000_000, 7, { seeders: 410, leechers: 8, quality: "Build 21 · Win/Mac/Linux x64", languages: ["English", "Multi-20"] }),
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
    repacks: [
      repack("endless-sky-official", "Official · v0.10.2 · Win/Mac/Linux x64", "official", "Official", 145_000_000, 3, { seeders: 580, leechers: 9, quality: "v0.10.2 · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
      repack("endless-sky-gog", "GOG Goodie Pack · Win x64", "gog", "GOG Games", 130_000_000, 19, { seeders: 318, leechers: 7, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-6"] }),
    ],
  },

  // ===== v3.8.1 — expanded catalog (28 more titles) =====

  {
    id: "openra",
    title: "OpenRA",
    developer: "OpenRA Contributors",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2010-06-15",
    description:
      "OpenRA is a free and open-source recreation of the classic Command & Conquer: Tiberian Dawn, Red Alert, and Dune 2000 real-time strategy games. Build bases, harvest Tiberium or ore, train vast armies, and wage war across beautifully redrawn maps with modern QoL improvements, online multiplayer, modding support, and a map editor.",
    shortDescription:
      "Open-source recreation of Command & Conquer, Red Alert and Dune 2000. Build bases, harvest resources, wage war across classic and modern maps.",
    genres: ["Real-Time Strategy", "Multiplayer", "Classic"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.6,
    ratingCount: 7820,
    sizeBytes: 180_000_000,
    license: "open-source",
    officialUrl: "https://www.openra.net",
    repacks: [
      repack("openra-official", "Official · playtest 20240830 · Win/Mac/Linux x64", "official", "Official", 180_000_000, 4, { seeders: 720, leechers: 12, quality: "playtest 20240830 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("openra-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 130_000_000, 18, { seeders: 540, leechers: 9, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "corsixth",
    title: "CorsixTH",
    developer: "CorsixTH Team",
    publisher: "Open Source (MIT)",
    releaseDate: "2012-07-22",
    description:
      "CorsixTH is an open-source reimplementation of the classic 1997 game Theme Hospital. Build and manage a hospital, cure bizarre diseases like Bloaty Head and Slack Tongue, train staff, deal with emergencies and epidemics, and try to keep your patients alive — and your balance sheet in the black.",
    shortDescription:
      "Open-source reimplementation of Theme Hospital. Build, cure bizarre diseases, manage staff and stay profitable in this classic sim.",
    genres: ["Simulation", "Management", "Comedy", "Classic"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.7,
    ratingCount: 6210,
    sizeBytes: 92_000_000,
    license: "open-source",
    officialUrl: "https://corsixth.com",
    repacks: [
      repack("corsixth-official", "Official · v0.67 · Win/Mac/Linux x64", "official", "Official", 92_000_000, 6, { seeders: 410, leechers: 7, quality: "v0.67 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("corsixth-gog", "GOG Goodie Pack · Win x64", "gog", "GOG Games", 85_000_000, 22, { seeders: 281, leechers: 4, quality: "Goodie Pack · Win x64", languages: ["English", "Multi-8"] }),
    ],
  },
  {
    id: "warzone2100",
    title: "Warzone 2100",
    developer: "Warzone 2100 Project",
    publisher: "Open Source (GPLv2)",
    releaseDate: "1999-03-10",
    description:
      "Warzone 2100 is a free and open-source real-time strategy game originally developed by Pumpkin Studios and released in 1999. Set in a post-nuclear future, you command a faction fighting to rebuild civilization through tactical combat, custom unit design, technology research, and a unique fully-3D campaign. Released to the open-source community in 2004.",
    shortDescription:
      "Open-source post-apocalyptic RTS with fully-3D combat, custom unit design and tech research. Originally released in 1999.",
    genres: ["Real-Time Strategy", "Post-Apocalyptic", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.4,
    ratingCount: 4280,
    sizeBytes: 320_000_000,
    license: "open-source",
    officialUrl: "https://wz2100.net",
    repacks: [
      repack("warzone-official", "Official · v4.5.5 · Win/Mac/Linux x64", "official", "Official", 320_000_000, 5, { seeders: 410, leechers: 8, quality: "v4.5.5 · Win/Mac/Linux x64", languages: ["English", "Multi-20"] }),
      repack("warzone-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 230_000_000, 18, { seeders: 280, leechers: 6, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "megaglest",
    title: "MegaGlest",
    developer: "MegaGlest Team",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2010-12-04",
    description:
      "MegaGlest is a free and open-source real-time strategy game with seven distinct factions — Magic, Tech, Egyptians, Indians, Norsemen, Persians and Romans — each with their own units, buildings, tech trees and playstyles. Build bases, harvest resources, and wage war across gorgeous 3D maps in single-player skirmish or 8-player online multiplayer.",
    shortDescription:
      "Open-source 3D RTS with 7 distinct factions (Magic, Tech, Egyptians, Indians, Norsemen, Persians, Romans).",
    genres: ["Real-Time Strategy", "Fantasy", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.2,
    ratingCount: 2180,
    sizeBytes: 320_000_000,
    license: "open-source",
    officialUrl: "https://megaglest.org",
    repacks: [
      repack("megaglest-official", "Official · v3.13.0 · Win/Mac/Linux x64", "official", "Official", 320_000_000, 7, { seeders: 312, leechers: 5, quality: "v3.13.0 · Win/Mac/Linux x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "triplea",
    title: "TripleA",
    developer: "TripleA Team",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2002-10-22",
    description:
      "TripleA is a free and open-source turn-based grand strategy game inspired by the Axis & Allies board game. Command any of the major powers of WWII — or fantasy, sci-fi, and historical civilizations across dozens of community-authored maps — in single-player against AI or play-by-email/online multiplayer.",
    shortDescription:
      "Open-source turn-based grand strategy (Axis & Allies style). WWII, fantasy, sci-fi and historical maps.",
    genres: ["Turn-Based Strategy", "Historical", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.5,
    ratingCount: 3810,
    sizeBytes: 380_000_000,
    license: "open-source",
    officialUrl: "https://triplea-game.org",
    repacks: [
      repack("triplea-official", "Official · v2.6+ · Win/Mac/Linux x64", "official", "Official", 380_000_000, 8, { seeders: 410, leechers: 6, quality: "v2.6+ · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
    ],
  },
  {
    id: "flightgear",
    title: "FlightGear",
    developer: "FlightGear Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "1997-07-08",
    description:
      "FlightGear is a free, open-source flight simulator with a sophisticated physics engine, over 700 aircraft models, and a complete worldwide scenery derived from real-world terrain data. Used by hobbyists, students, and even professional pilots for training — and it's all completely free.",
    shortDescription:
      "Open-source flight simulator with 700+ aircraft and worldwide scenery. Used by hobbyists and pilots for training.",
    genres: ["Simulation", "Flight", "Realistic"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.3,
    ratingCount: 5210,
    sizeBytes: 2_400_000_000,
    license: "open-source",
    officialUrl: "https://www.flightgear.org",
    repacks: [
      repack("flightgear-official", "Official · v2024.1 · Win/Mac/Linux x64", "official", "Official", 2_400_000_000, 4, { seeders: 510, leechers: 18, quality: "v2024.1 · Win/Mac/Linux x64", languages: ["English", "Multi-20"] }),
      repack("flightgear-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 1_650_000_000, 14, { seeders: 281, leechers: 7, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "stuntrally",
    title: "Stunt Rally",
    developer: "Crystal Hammer & Wraith",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2010-08-22",
    description:
      "Stunt Rally is a free and open-source 3D racing game with a track editor, support for over 170 tracks, and a unique blend of stunt-based rally racing. Drive across canyons, jump over chasms, race against the clock or against AI opponents — all in a fully procedurally-modifiable environment.",
    shortDescription:
      "Open-source 3D stunt rally racer with 170+ tracks and a track editor. Race across canyons and jump chasms.",
    genres: ["Racing", "Stunt", "Sandbox"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.4,
    ratingCount: 2840,
    sizeBytes: 690_000_000,
    license: "open-source",
    officialUrl: "https://stuntrally.tuxfamily.org",
    repacks: [
      repack("stuntrally-official", "Official · v2.7 · Win/Linux x64", "official", "Official", 690_000_000, 9, { seeders: 380, leechers: 8, quality: "v2.7 · Win/Linux x64", languages: ["English", "Multi-8"] }),
    ],
  },
  {
    id: "supertux",
    title: "SuperTux",
    developer: "SuperTux Team",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2003-12-23",
    description:
      "SuperTux is a free, open-source classic 2D jump'n'run side-scroller in the spirit of Super Mario. Take on the role of Tux the penguin, run and jump across 26+ levels in the Icy Island and Forest worlds, throw snowballs at enemies, collect coins and power-ups, and rescue Penny from the clutches of Nolok.",
    shortDescription:
      "Open-source 2D platformer (Super Mario-style). Play as Tux the penguin across 26+ levels in Icy Island and Forest worlds.",
    genres: ["Platformer", "Family", "Classic"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.5,
    ratingCount: 6210,
    sizeBytes: 110_000_000,
    license: "open-source",
    officialUrl: "https://supertux.org",
    repacks: [
      repack("supertux-official", "Official · v0.6.3 · Win/Mac/Linux x64", "official", "Official", 110_000_000, 11, { seeders: 510, leechers: 7, quality: "v0.6.3 · Win/Mac/Linux x64", languages: ["English", "Multi-30"] }),
      repack("supertux-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 65_000_000, 21, { seeders: 410, leechers: 5, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "frogatto",
    title: "Frogatto & Friends",
    developer: "Frogatto Team",
    publisher: "Open Source (CC BY-SA / GPLv3)",
    releaseDate: "2010-07-13",
    description:
      "Frogatto & Friends is a free, open-source action-platformer with beautiful hand-drawn pixel art, a charming original soundtrack, and a 12+ hour story campaign. Play as Frogatto — a sarcastic frog with a penchant for adventure — across dozens of levels, talking to NPCs, fighting enemies, and uncovering a quirky fantasy world.",
    shortDescription:
      "Open-source pixel-art action-platformer. 12+ hour story campaign as a sarcastic frog, hand-drawn art, charming soundtrack.",
    genres: ["Platformer", "Action", "Pixel Art", "Family"],
    tags: ["Open Source", "Single Player", "Hand-drawn"],
    rating: 4.3,
    ratingCount: 2810,
    sizeBytes: 145_000_000,
    license: "open-source",
    officialUrl: "https://frogatto.com",
    repacks: [
      repack("frogatto-official", "Official · v1.5 · Win/Mac/Linux x64", "official", "Official", 145_000_000, 9, { seeders: 410, leechers: 6, quality: "v1.5 · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
    ],
  },
  {
    id: "tome4",
    title: "Tales of Maj'Eyal",
    developer: "DarkGod",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2010-12-31",
    description:
      "Tales of Maj'Eyal (ToME) is a free, open-source, feature-rich roguelike set in the world of Eyal. With 22 unique classes, 14 races, deep tactical combat, an unlock-based meta progression system, an enormous world, modding support, and online achievements — it's one of the most beloved modern roguelikes ever made.",
    shortDescription:
      "Open-source tactical roguelike with 22 classes, 14 races, deep combat, unlock-based meta progression and online achievements.",
    genres: ["Roguelike", "Turn-Based", "Fantasy"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.8,
    ratingCount: 5120,
    sizeBytes: 120_000_000,
    license: "open-source",
    officialUrl: "https://te4.org",
    repacks: [
      repack("tome4-official", "Official · v1.7.4 · Win/Mac/Linux x64", "official", "Official", 120_000_000, 7, { seeders: 510, leechers: 6, quality: "v1.7.4 · Win/Mac/Linux x64", languages: ["English", "Multi-8"] }),
      repack("tome4-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 78_000_000, 19, { seeders: 380, leechers: 4, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "crawlsoup",
    title: "Dungeon Crawl Stone Soup",
    developer: "Crawl Devteam",
    publisher: "Open Source (GPLv2)",
    releaseDate: "1997-12-22",
    description:
      "Dungeon Crawl Stone Soup is a free, open-source roguelike game of underground exploration, combat, and treasure-hunting. Descend through the infinite, procedurally-generated Dungeon of Zot, gather the legendary Orb of Zot, and escape alive — fighting monsters, finding loot, and learning the many devious interactions between items, gods, and creatures.",
    shortDescription:
      "Open-source roguelike of dungeon exploration. Gather the Orb of Zot and escape. Endless replayability.",
    genres: ["Roguelike", "Dungeon Crawler", "Turn-Based"],
    tags: ["Open Source", "Single Player", "Procedural"],
    rating: 4.6,
    ratingCount: 4280,
    sizeBytes: 32_000_000,
    license: "open-source",
    officialUrl: "https://crawl.develz.org",
    repacks: [
      repack("crawl-official", "Official · v0.32 · Win/Mac/Linux x64", "official", "Official", 32_000_000, 5, { seeders: 410, leechers: 5, quality: "v0.32 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "nethack",
    title: "NetHack",
    developer: "NetHack DevTeam",
    publisher: "Open Source (NGPL)",
    releaseDate: "1987-07-23",
    description:
      "NetHack is one of the oldest and most influential roguelike games ever made — first released in 1987 and still actively developed. Descend through the Dungeons of Doom, fight monsters, collect treasure, and find the Amulet of Yendor. Famous for its emergent gameplay and the legendary 'DevTeam thinks of everything' depth.",
    shortDescription:
      "The classic 1987 roguelike — descend the Dungeons of Doom, find the Amulet of Yendor. Influential and still actively developed.",
    genres: ["Roguelike", "Classic", "Turn-Based"],
    tags: ["Open Source", "Single Player", "Procedural"],
    rating: 4.7,
    ratingCount: 3210,
    sizeBytes: 12_000_000,
    license: "open-source",
    officialUrl: "https://www.nethack.org",
    repacks: [
      repack("nethack-official", "Official · v3.7 · Win/Mac/Linux x64", "official", "Official", 12_000_000, 13, { seeders: 510, leechers: 4, quality: "v3.7 · Win/Mac/Linux x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "ufoai",
    title: "UFO: Alien Invasion",
    developer: "UFO:AI Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2003-08-12",
    description:
      "UFO: Alien Invasion is a free, open-source squad-based tactical strategy game in the spirit of the original X-COM: UFO Defense. Command PHALANX — Earth's last line of defense — research captured alien tech, build and customize bases, intercept UFOs, and lead squads of soldiers through tense turn-based combat missions around the globe.",
    shortDescription:
      "Open-source squad-based tactical strategy (X-COM: UFO Defense style). Research aliens, build bases, intercept UFOs.",
    genres: ["Turn-Based Strategy", "Sci-Fi", "Squad Tactics"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.3,
    ratingCount: 2810,
    sizeBytes: 920_000_000,
    license: "open-source",
    officialUrl: "https://ufoai.org",
    repacks: [
      repack("ufoai-official", "Official · v2.5 · Win/Mac/Linux x64", "official", "Official", 920_000_000, 9, { seeders: 410, leechers: 7, quality: "v2.5 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("ufoai-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 680_000_000, 22, { seeders: 318, leechers: 6, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "freecol",
    title: "FreeCol",
    developer: "FreeCol Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2002-12-31",
    description:
      "FreeCol is a free, open-source turn-based strategy game based on the 1994 classic Sid Meier's Colonization. Lead European settlers to the New World, found colonies, trade with natives, declare independence, and fight a Revolutionary War against your mother country. The gameplay is faithful to the original, with modernized UI, online multiplayer, and modding support.",
    shortDescription:
      "Open-source Colonization remake. Found colonies, trade with natives, declare independence and fight a Revolutionary War.",
    genres: ["Turn-Based Strategy", "Historical", "Economy"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.4,
    ratingCount: 3210,
    sizeBytes: 145_000_000,
    license: "open-source",
    officialUrl: "https://www.freecol.org",
    repacks: [
      repack("freecol-official", "Official · v1.2.0 · Win/Mac/Linux x64", "official", "Official", 145_000_000, 7, { seeders: 410, leechers: 5, quality: "v1.2.0 · Win/Mac/Linux x64", languages: ["English", "Multi-20"] }),
    ],
  },
  {
    id: "freeserf",
    title: "Freeserf",
    developer: "Freeserf Project",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2013-07-04",
    description:
      "Freeserf is a free, open-source reimplementation of the classic 1993 game The Settlers (Serf City). Build a medieval settlement, manage complex supply chains, train soldiers, expand your territory across hand-drawn maps, and engage in tactical battles — all faithful to the original Blue Byte classic.",
    shortDescription:
      "Open-source The Settlers (1993) remake. Build medieval settlements, manage supply chains, expand your territory.",
    genres: ["Real-Time Strategy", "Economy", "City Builder", "Classic"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.1,
    ratingCount: 1180,
    sizeBytes: 48_000_000,
    license: "open-source",
    officialUrl: "https://github.com/freeserf/freeserf",
    repacks: [
      repack("freeserf-official", "Official · v0.3.0 · Win/Mac/Linux x64", "official", "Official", 48_000_000, 14, { seeders: 318, leechers: 4, quality: "v0.3.0 · Win/Mac/Linux x64", languages: ["English", "Multi-8"] }),
    ],
  },
  {
    id: "unknownhorizons",
    title: "Unknown Horizons",
    developer: "Unknown Horizons Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2010-08-22",
    description:
      "Unknown Horizons is a free, open-source 2D real-time economy simulation and city-builder in the spirit of Anno 1602. Sail to undiscovered islands, found settlements, build production chains, trade with other players, satisfy your settlers' escalating needs, and grow a New World empire.",
    shortDescription:
      "Open-source Anno 1602-style city-builder. Sail to islands, found settlements, manage production chains.",
    genres: ["Real-Time Strategy", "Economy", "City Builder"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.0,
    ratingCount: 1820,
    sizeBytes: 280_000_000,
    license: "open-source",
    officialUrl: "https://unknown-horizons.org",
    repacks: [
      repack("unknown-horizons-official", "Official · v2024.1 · Win/Mac/Linux x64", "official", "Official", 280_000_000, 6, { seeders: 410, leechers: 7, quality: "v2024.1 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "flare",
    title: "Flare: Empyrion",
    developer: "Flare Team",
    publisher: "Open Source (GPLv3 / CC BY-SA)",
    releaseDate: "2011-09-22",
    description:
      "Flare (Flare Empyrion) is a free, open-source 2D action-RPG engine in the spirit of Diablo. With a default campaign (Empyrion) plus dozens of community-authored adventures, fast-paced real-time combat, loot galore, character builds across three skill trees, and modding tools for creating your own ARPG — it's a love letter to classic Diablo-style gaming.",
    shortDescription:
      "Open-source 2D action-RPG (Diablo style). Fast-paced real-time combat, loot galore, character builds across three skill trees.",
    genres: ["Action RPG", "Fantasy", "Single Player"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.4,
    ratingCount: 2810,
    sizeBytes: 180_000_000,
    license: "open-source",
    officialUrl: "https://flarerpg.org",
    repacks: [
      repack("flare-official", "Official · v2.0 · Win/Mac/Linux x64", "official", "Official", 180_000_000, 9, { seeders: 410, leechers: 6, quality: "v2.0 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
      repack("flare-fitgirl", "FitGirl Repack · Compressed · Win x64", "fitgirl", "FitGirl", 110_000_000, 21, { seeders: 318, leechers: 4, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "lincity",
    title: "LinCity-NG",
    developer: "LinCity-NG Project",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2005-08-22",
    description:
      "LinCity-NG is a free, open-source city simulation game in the spirit of SimCity. Build and manage a city — residential, commercial, industrial zones, power plants, transport, schools, hospitals, and parks — while balancing the budget and keeping your citizens happy.",
    shortDescription:
      "Open-source SimCity-style city builder. Zone, build infrastructure, balance the budget, keep citizens happy.",
    genres: ["Simulation", "City Builder", "Sandbox"],
    tags: ["Open Source", "Single Player", "Moddable"],
    rating: 4.0,
    ratingCount: 1420,
    sizeBytes: 38_000_000,
    license: "open-source",
    officialUrl: "https://github.com/lincity-ng/lincity-ng",
    repacks: [
      repack("lincity-official", "Official · v2.0 · Win/Mac/Linux x64", "official", "Official", 38_000_000, 16, { seeders: 318, leechers: 4, quality: "v2.0 · Win/Mac/Linux x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "globulation2",
    title: "Globulation 2",
    developer: "Globulation 2 Team",
    publisher: "Open Source (GPLv3)",
    releaseDate: "2008-09-22",
    description:
      "Globulation 2 is a free, open-source real-time strategy game that takes a novel approach: your units are self-organizing. Instead of micromanaging every soldier, you set high-level goals and the AI handles pathing, formation, and resource gathering. Build your economy, train armies, and battle across 25+ campaign missions and dozens of multiplayer maps.",
    shortDescription:
      "Open-source RTS with self-organizing units. Set high-level goals; AI handles pathing and formation. 25+ campaign missions.",
    genres: ["Real-Time Strategy", "Multiplayer", "Innovation"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.2,
    ratingCount: 1820,
    sizeBytes: 85_000_000,
    license: "open-source",
    officialUrl: "https://globulation2.org",
    repacks: [
      repack("glob2-official", "Official · v1.0.5 · Win/Mac/Linux x64", "official", "Official", 85_000_000, 14, { seeders: 318, leechers: 4, quality: "v1.0.5 · Win/Mac/Linux x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "speeddreams",
    title: "Speed Dreams",
    developer: "Speed Dreams Team",
    publisher: "Open Source (GPLv2)",
    releaseDate: "2008-12-22",
    description:
      "Speed Dreams is a free, open-source 3D motorsport simulator forked from TORCS. With realistic physics, dozens of cars and tracks, GT, F1, rally, and stock car categories, and full multiplayer support, it's the most complete open-source racing sim available.",
    shortDescription:
      "Open-source 3D motorsport simulator (TORCS fork). Realistic physics, dozens of cars + tracks, GT/F1/rally/stock categories.",
    genres: ["Racing", "Simulation", "Multiplayer"],
    tags: ["Open Source", "Online Multiplayer", "Moddable"],
    rating: 4.3,
    ratingCount: 2810,
    sizeBytes: 720_000_000,
    license: "open-source",
    officialUrl: "https://www.speed-dreams.org",
    repacks: [
      repack("speeddreams-official", "Official · v2.3 · Win/Mac/Linux x64", "official", "Official", 720_000_000, 8, { seeders: 410, leechers: 7, quality: "v2.3 · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
      repack("speeddreams-dodi", "DODI Repack · Compressed · Win x64", "dodi", "DODI", 510_000_000, 22, { seeders: 281, leechers: 6, quality: "Compressed · Win x64", languages: ["English"] }),
    ],
  },
  {
    id: "warzone2100-towerfall-ascension",
    title: "TowerFall Ascension",
    developer: "Maddy Thorson",
    publisher: "Maddy Makes Games",
    releaseDate: "2014-03-25",
    description:
      "TowerFall Ascension is an acclaimed 2D archery combat game with brutal, fast-paced local and online multiplayer for up to 4 players, plus a co-op Ascension campaign mode. Time your arrows, dodge enemy fire, and catch incoming arrows mid-air in this love letter to classic arcade couch-vs-couch brawlers. (Note: featured free demo via Steam. Full game is paid — but the demo alone is hours of fun.)",
    shortDescription:
      "Acclaimed 2D archery combat game. Local/online co-op + 4-player couch-vs. Catch arrows mid-air. Free demo.",
    genres: ["Action", "Multiplayer", "Co-op", "Platformer"],
    tags: ["Free Demo", "Local Co-op", "Online Multiplayer"],
    rating: 4.7,
    ratingCount: 12420,
    sizeBytes: 380_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/251470/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/251470/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/251470/library_hero.jpg",
    license: "demo",
    officialUrl: "https://www.towerfall-game.com",
    repacks: [
      repack("towerfall-demo", "Steam Demo · v1.0 · Win/Mac/Linux x64", "official", "Official", 380_000_000, 4, { seeders: 920, leechers: 18, quality: "Demo · Win/Mac/Linux x64", languages: ["English", "Multi-8"] }),
    ],
  },
  {
    id: "warframe",
    title: "Warframe",
    developer: "Digital Extremes",
    publisher: "Digital Extremes",
    releaseDate: "2013-03-25",
    description:
      "Warframe is a free-to-play online action game that has steadily grown into one of the most beloved live-service looter-shooters ever made. Play as a Tenno — ancient warriors who wield the bio-mechanical Warframe battlesuits — across an ever-expanding universe of procedurally-generated missions, open worlds, deep crafting, hundreds of weapons, and a constantly-updated story.",
    shortDescription:
      "Free-to-play online looter-shooter. Play as a Tenno, wield bio-mechanical Warframe battlesuits across a vast ever-expanding universe.",
    genres: ["Action", "Looter-Shooter", "Online Multiplayer", "Co-op"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.6,
    ratingCount: 348_120,
    sizeBytes: 35_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/230410/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/230410/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/230410/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.warframe.com",
    repacks: [
      repack("warframe-steam", "Steam · Latest · Win x64", "official", "Official", 35_000_000_000, 1, { seeders: 9999, leechers: 142, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("warframe-standalone", "Standalone Launcher · Win x64", "official", "Official", 32_000_000_000, 8, { seeders: 8210, leechers: 92, quality: "Direct launcher · Win x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "pathofexile",
    title: "Path of Exile",
    developer: "Grinding Gear Games",
    publisher: "Grinding Gear Games",
    releaseDate: "2013-10-23",
    description:
      "Path of Exile is a free-to-play online action RPG set in the dark fantasy world of Wraeclast. Designed as a spiritual successor to Diablo II, it features a massive passive skill tree, a unique skill gem system, deep crafting, regular league resets with new mechanics, and a brutally satisfying combat loop that has earned it a reputation as the deepest ARPG ever made.",
    shortDescription:
      "Free-to-play online ARPG (Diablo II successor). Massive passive skill tree, skill gems, deep crafting, regular league resets.",
    genres: ["Action RPG", "Looter", "Online Multiplayer", "Fantasy"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.6,
    ratingCount: 198_280,
    sizeBytes: 32_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/238960/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/238960/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/238960/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.pathofexile.com",
    repacks: [
      repack("poe-steam", "Steam · Latest · Win x64", "official", "Official", 32_000_000_000, 1, { seeders: 9999, leechers: 121, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("poe-standalone", "Standalone Launcher · Win x64", "official", "Official", 30_000_000_000, 6, { seeders: 7240, leechers: 84, quality: "Direct launcher · Win x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "destiny2",
    title: "Destiny 2",
    developer: "Bungie",
    publisher: "Bungie",
    releaseDate: "2017-10-24",
    description:
      "Destiny 2 is a free-to-play online first-person shooter with cinematic story campaigns, challenging co-op strikes and raids, and competitive PvP. As a Guardian of the Last Safe City, wield the Light against the Darkness across the solar system — with the free New Light entry giving new players a huge slice of content before any paid expansions.",
    shortDescription:
      "Free-to-play online FPS. Cinematic campaigns, co-op strikes + raids, competitive PvP. Free New Light entry tier.",
    genres: ["FPS", "Looter-Shooter", "Online Multiplayer", "Co-op"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.4,
    ratingCount: 412_510,
    sizeBytes: 110_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1085660/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1085660/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1085660/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.bungie.net/7/en/Destiny",
    repacks: [
      repack("d2-steam", "Steam · Latest · Win x64", "official", "Official", 110_000_000_000, 1, { seeders: 9999, leechers: 312, quality: "Steam installer · Win x64", languages: ["English", "Multi-12"] }),
      repack("d2-bnet", "Battle.net · Latest · Win x64", "official", "Official", 108_000_000_000, 4, { seeders: 8210, leechers: 281, quality: "Battle.net launcher · Win x64", languages: ["English", "Multi-12"] }),
    ],
  },
  {
    id: "apexlegends",
    title: "Apex Legends",
    developer: "Respawn Entertainment",
    publisher: "Electronic Arts",
    releaseDate: "2019-02-04",
    description:
      "Apex Legends is a free-to-play hero shooter battle royale set in the Titanfall universe. Choose from a roster of unique Legends — each with their own abilities, ultimate, and playstyle — squad up with two teammates, and drop into the Apex Games for fast-paced, vertical, movement-heavy combat across an ever-evolving map rotation.",
    shortDescription:
      "Free-to-play hero shooter battle royale (Titanfall universe). Unique Legends, fast-paced movement-heavy combat.",
    genres: ["Battle Royale", "FPS", "Hero Shooter", "Online Multiplayer"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.2,
    ratingCount: 412_810,
    sizeBytes: 75_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1172470/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.ea.com/games/apex-legends",
    repacks: [
      repack("apex-steam", "Steam · Latest · Win x64", "official", "Official", 75_000_000_000, 1, { seeders: 9999, leechers: 318, quality: "Steam installer · Win x64", languages: ["English", "Multi-20"] }),
      repack("apex-ea", "EA App · Latest · Win x64", "official", "Official", 73_000_000_000, 5, { seeders: 7240, leechers: 281, quality: "EA App installer · Win x64", languages: ["English", "Multi-20"] }),
    ],
  },
  {
    id: "dota2",
    title: "Dota 2",
    developer: "Valve",
    publisher: "Valve",
    releaseDate: "2013-07-09",
    description:
      "Dota 2 is a free-to-play MOBA from Valve — the original Defense of the Ancients, evolved. Pick from over 120 unique heroes, team up with four allies, and battle to destroy the enemy Ancient across one of the deepest, most skill-expressive competitive games ever made.",
    shortDescription:
      "Free-to-play MOBA from Valve. 120+ heroes, 5v5 competitive depth. The original DOTA evolved.",
    genres: ["MOBA", "Strategy", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "eSports"],
    rating: 4.5,
    ratingCount: 1_284_120,
    sizeBytes: 22_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.dota2.com",
    repacks: [
      repack("dota2-steam", "Steam · Latest · Win/Mac/Linux x64", "official", "Official", 22_000_000_000, 1, { seeders: 9999, leechers: 410, quality: "Steam installer · Win/Mac/Linux x64", languages: ["English", "Multi-25"] }),
    ],
  },
  {
    id: "cs2",
    title: "Counter-Strike 2",
    developer: "Valve",
    publisher: "Valve",
    releaseDate: "2023-09-27",
    description:
      "Counter-Strike 2 is the largest technical leap in Counter-Strike's history, built on Source 2 with sub-tick servers, responsive smokes, and upgraded graphics. CS2 is a free upgrade for all CS:GO players and continues the legendary 5v5 tactical FPS legacy — bomb defusal, hostage rescue, eco rounds, and the world's most competitive skill ceiling.",
    shortDescription:
      "Free-to-play 5v5 tactical FPS on Source 2. Sub-tick servers, responsive smokes, the world's most competitive shooter.",
    genres: ["FPS", "Tactical", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "eSports"],
    rating: 4.4,
    ratingCount: 6_810_280,
    sizeBytes: 35_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.counter-strike.net/cs2",
    repacks: [
      repack("cs2-steam", "Steam · Latest · Win x64", "official", "Official", 35_000_000_000, 1, { seeders: 9999, leechers: 510, quality: "Steam installer · Win x64", languages: ["English", "Multi-25"] }),
    ],
  },
  {
    id: "tf2",
    title: "Team Fortress 2",
    developer: "Valve",
    publisher: "Valve",
    releaseDate: "2007-10-10",
    description:
      "Team Fortress 2 is the legendary class-based team shooter from Valve. Nine distinct classes — Scout, Soldier, Pyro, Demoman, Heavy, Engineer, Medic, Sniper, and Spy — battle across Payload, Control Point, King of the Hill, and Mann vs. Machine co-op. The grandfather of the modern hero shooter, still going strong after 17+ years.",
    shortDescription:
      "Free-to-play class-based team shooter from Valve. 9 distinct classes, Payload/CP/Koth + Mann vs Machine co-op. 17+ years strong.",
    genres: ["FPS", "Class-Based", "Online Multiplayer", "Co-op"],
    tags: ["Free to Play", "Online Multiplayer", "Classic"],
    rating: 4.6,
    ratingCount: 982_140,
    sizeBytes: 25_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/440/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/440/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/440/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.teamfortress.com",
    repacks: [
      repack("tf2-steam", "Steam · Latest · Win x64", "official", "Official", 25_000_000_000, 1, { seeders: 9999, leechers: 410, quality: "Steam installer · Win x64", languages: ["English", "Multi-20"] }),
    ],
  },
  {
    id: "overwatch2",
    title: "Overwatch 2",
    developer: "Blizzard Entertainment",
    publisher: "Blizzard Entertainment",
    releaseDate: "2022-10-04",
    description:
      "Overwatch 2 is a free-to-play, team-based 5v5 hero shooter. With a roster of 35+ unique heroes — each with their own abilities and ultimates — fight across Payload, Push, Control, and Flashpoint modes, plus the acclaimed PvE Story Missions and the roguelike PvE Hero Mastery missions.",
    shortDescription:
      "Free-to-play 5v5 hero shooter. 35+ heroes, Payload/Push/Control modes + PvE Story Missions.",
    genres: ["Hero Shooter", "FPS", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "eSports"],
    rating: 3.8,
    ratingCount: 412_510,
    sizeBytes: 50_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2357570/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2357570/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2357570/library_hero.jpg",
    license: "free",
    officialUrl: "https://overwatch.blizzard.com",
    repacks: [
      repack("ow2-bnet", "Battle.net · Latest · Win x64", "official", "Official", 50_000_000_000, 1, { seeders: 9999, leechers: 318, quality: "Battle.net installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("ow2-steam", "Steam · Latest · Win x64", "official", "Official", 48_000_000_000, 5, { seeders: 7240, leechers: 281, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "thefinals",
    title: "The Finals",
    developer: "Embark Studios",
    publisher: "Embark Studios",
    releaseDate: "2023-12-07",
    description:
      "THE FINALS is a free-to-play, fast-paced 3v3 first-person shooter set in a virtual game show where teams of three fight for cash prizes in fully destructible environments. Wreck skyscrapers, blow through walls, and chain explosive set-pieces across dynamic maps inspired by real-world cities — the most destructible FPS ever made.",
    shortDescription:
      "Free-to-play 3v3 FPS in fully destructible environments. Blow through walls, topple skyscrapers in a virtual game show.",
    genres: ["FPS", "Destructible", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "Destruction"],
    rating: 4.3,
    ratingCount: 218_410,
    sizeBytes: 24_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2073850/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2073850/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2073850/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.reachthefinals.com",
    repacks: [
      repack("finals-steam", "Steam · Latest · Win x64", "official", "Official", 24_000_000_000, 1, { seeders: 9999, leechers: 318, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "marvelsnap",
    title: "Marvel Snap",
    developer: "Second Dinner",
    publisher: "Nuverse",
    releaseDate: "2022-10-18",
    description:
      "Marvel Snap is a free-to-play, fast-paced collectible card game from the creators of Hearthstone. Build a 12-card deck featuring Marvel heroes and villains, battle opponents in quick 3-minute matches across three locations, and 'SNAP' to double your stakes when you think you've got the win.",
    shortDescription:
      "Free-to-play fast-paced Marvel CCG. 12-card decks, 3-minute matches, three locations, double-down SNAP mechanic.",
    genres: ["Card Game", "Strategy", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.6,
    ratingCount: 142_810,
    sizeBytes: 4_500_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1997040/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1997040/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/1997040/library_hero.jpg",
    license: "free",
    officialUrl: "https://marvelsnap.com",
    repacks: [
      repack("snap-steam", "Steam · Latest · Win/Mac x64", "official", "Official", 4_500_000_000, 1, { seeders: 9999, leechers: 121, quality: "Steam installer · Win/Mac x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "brawlhalla",
    title: "Brawlhalla",
    developer: "Blue Mammoth Games",
    publisher: "Ubisoft",
    releaseDate: "2017-10-17",
    description:
      "Brawlhalla is a free-to-play platform fighting game in the spirit of Super Smash Bros. Pick from 50+ unique Legends, battle across platforms, knock opponents off-screen, and prove you're the baddest brawler around. Supports 1v1, 2v2, free-for-all, and local couch play.",
    shortDescription:
      "Free-to-play platform fighter (Smash Bros-style). 50+ Legends, 1v1/2v1/FFA, local + online multiplayer.",
    genres: ["Fighting", "Platformer", "Multiplayer", "Family"],
    tags: ["Free to Play", "Online Multiplayer", "Local Co-op"],
    rating: 4.5,
    ratingCount: 312_510,
    sizeBytes: 2_200_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/291550/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/291550/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/291550/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.brawlhalla.com",
    repacks: [
      repack("brawlhalla-steam", "Steam · Latest · Win x64", "official", "Official", 2_200_000_000, 1, { seeders: 9999, leechers: 121, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "trackmania",
    title: "Trackmania",
    developer: "Ubisoft Nadeo",
    publisher: "Ubisoft",
    releaseDate: "2020-07-01",
    description:
      "Trackmania is the free-to-play reboot of the legendary time-trial racing series. Hit absurd tracks at full speed, master precision drifting, and chase the perfect time across hundreds of official and community-built tracks. Features cross-platform multiplayer, a deep track editor, and seasonal campaigns.",
    shortDescription:
      "Free-to-play time-trial racer. Hit absurd tracks at full speed, chase perfect times across hundreds of community tracks.",
    genres: ["Racing", "Time Trial", "Online Multiplayer", "Sandbox"],
    tags: ["Free to Play", "Online Multiplayer", "Track Editor"],
    rating: 4.3,
    ratingCount: 82_140,
    sizeBytes: 12_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2225070/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2225070/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2225070/library_hero.jpg",
    license: "free",
    officialUrl: "https://trackmania.com",
    repacks: [
      repack("tm-ubisoft", "Ubisoft Connect · Latest · Win x64", "official", "Official", 12_000_000_000, 1, { seeders: 9999, leechers: 121, quality: "Ubisoft Connect installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("tm-steam", "Steam · Latest · Win x64", "official", "Official", 11_500_000_000, 5, { seeders: 7240, leechers: 92, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "warthunder",
    title: "War Thunder",
    developer: "Gaijin Entertainment",
    publisher: "Gaijin Entertainment",
    releaseDate: "2012-08-15",
    description:
      "War Thunder is a free-to-play vehicular combat MMO spanning aviation, ground, and naval forces from WWI to modern day. Pilot fighters, drive tanks, command warships across hundreds of historically-accurate vehicles, in massive PvP battles with realistic physics and damage modeling.",
    shortDescription:
      "Free-to-play vehicular combat MMO. Pilot planes, drive tanks, command ships across hundreds of historical vehicles, WWI to modern.",
    genres: ["Vehicular Combat", "Simulation", "Online Multiplayer", "Historical"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.4,
    ratingCount: 412_140,
    sizeBytes: 60_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/236390/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/236390/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/236390/library_hero.jpg",
    license: "free",
    officialUrl: "https://warthunder.com",
    repacks: [
      repack("wt-steam", "Steam · Latest · Win x64", "official", "Official", 60_000_000_000, 1, { seeders: 9999, leechers: 410, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("wt-standalone", "Standalone Launcher · Win x64", "official", "Official", 58_000_000_000, 4, { seeders: 8210, leechers: 312, quality: "Direct launcher · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "zenlesszonezero",
    title: "Zenless Zone Zero",
    developer: "HoYoverse",
    publisher: "HoYoverse",
    releaseDate: "2024-07-04",
    description:
      "Zenless Zone Zero is a free-to-play urban ARPG from the makers of Genshin Impact and Honkai Star Rail. Set in the post-apocalyptic city of New Eridu, master flashy real-time combat with a roster of agents, explore the supernatural Hollows, and uncover the truth behind the cataclysm that nearly destroyed humanity.",
    shortDescription:
      "Free-to-play urban ARPG from HoYoverse. Flashy real-time combat, explore the supernatural Hollows of New Eridu.",
    genres: ["Action RPG", "Urban", "Online Multiplayer", "Gacha"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.4,
    ratingCount: 312_410,
    sizeBytes: 18_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2649030/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2649030/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/2649030/library_hero.jpg",
    license: "free",
    officialUrl: "https://zenless.hoyoverse.com",
    repacks: [
      repack("zzz-steam", "Steam · Latest · Win x64", "official", "Official", 18_000_000_000, 1, { seeders: 9999, leechers: 218, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
      repack("zzz-standalone", "HoYoPlay Launcher · Win x64", "official", "Official", 17_500_000_000, 3, { seeders: 8210, leechers: 184, quality: "HoYoPlay launcher · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "wutheringwaves",
    title: "Wuthering Waves",
    developer: "Kuro Games",
    publisher: "Kuro Games",
    releaseDate: "2024-05-23",
    description:
      "Wuthering Waves is a free-to-play open-world action RPG from Kuro Games. Awaken as a Rover in a world scarred by the Lament catastrophe, master deep real-time combat with parries, dodges, and skill-based combos, explore a vast handcrafted world, and assemble a roster of Resonators — each with their own combat style and story.",
    shortDescription:
      "Free-to-play open-world ARPG from Kuro Games. Deep real-time combat (parry/dodge), vast handcrafted world, Resonator roster.",
    genres: ["Action RPG", "Open World", "Online Multiplayer", "Gacha"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.5,
    ratingCount: 218_120,
    sizeBytes: 22_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/3245080/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/3245080/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/3245080/library_hero.jpg",
    license: "free",
    officialUrl: "https://wutheringwaves.kurogames.com",
    repacks: [
      repack("wuwa-steam", "Steam · Latest · Win x64", "official", "Official", 22_000_000_000, 1, { seeders: 9999, leechers: 184, quality: "Steam installer · Win x64", languages: ["English", "Multi-10"] }),
      repack("wuwa-standalone", "Standalone Launcher · Win x64", "official", "Official", 21_500_000_000, 4, { seeders: 7240, leechers: 142, quality: "Direct launcher · Win x64", languages: ["English", "Multi-10"] }),
    ],
  },
  {
    id: "paladins",
    title: "Paladins",
    developer: "Evil Mojo Games",
    publisher: "Hi-Rez",
    releaseDate: "2018-05-08",
    description:
      "Paladins is a free-to-play team-based hero shooter with a deck-building card system that lets you customize your champion's abilities on the fly. With 50+ Champions across Front Line, Damage, Flank, and Support roles, battle across Siege, Onslaught, and Team Deathmatch modes in 5v5 team fights.",
    shortDescription:
      "Free-to-play team hero shooter. 50+ Champions, deck-building card system for ability customization, 5v5 Siege/Onslaught/TDM.",
    genres: ["Hero Shooter", "FPS", "Online Multiplayer", "Competitive"],
    tags: ["Free to Play", "Online Multiplayer", "Live Service"],
    rating: 4.3,
    ratingCount: 312_120,
    sizeBytes: 30_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/444090/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/444090/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/444090/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.paladins.com",
    repacks: [
      repack("paladins-steam", "Steam · Latest · Win x64", "official", "Official", 30_000_000_000, 1, { seeders: 9999, leechers: 318, quality: "Steam installer · Win x64", languages: ["English", "Multi-15"] }),
    ],
  },
  {
    id: "albiononline",
    title: "Albion Online",
    developer: "Sandbox Interactive",
    publisher: "Sandbox Interactive",
    releaseDate: "2017-07-17",
    description:
      "Albion Online is a free-to-play sandbox MMORPG with a fully player-driven economy. Craft every item, build cities, conquer territories, engage in full-loot PvP in the black zones, or stick to safe PvE. With a classless 'you are what you wear' system, every build is possible.",
    shortDescription:
      "Free-to-play sandbox MMORPG. Player-driven economy, classless 'you are what you wear' system, full-loot PvP + safe PvE zones.",
    genres: ["MMORPG", "Sandbox", "Online Multiplayer", "PvP"],
    tags: ["Free to Play", "Online Multiplayer", "Player Economy"],
    rating: 4.3,
    ratingCount: 92_140,
    sizeBytes: 12_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/761890/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/761890/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/761890/library_hero.jpg",
    license: "free",
    officialUrl: "https://albiononline.com",
    repacks: [
      repack("albion-steam", "Steam · Latest · Win/Mac/Linux x64", "official", "Official", 12_000_000_000, 1, { seeders: 9999, leechers: 142, quality: "Steam installer · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
      repack("albion-standalone", "Standalone Launcher · Win/Mac/Linux x64", "official", "Official", 11_500_000_000, 6, { seeders: 7240, leechers: 121, quality: "Direct launcher · Win/Mac/Linux x64", languages: ["English", "Multi-10"] }),
    ],
  },
  {
    id: "eveonline",
    title: "EVE Online",
    developer: "CCP Games",
    publisher: "CCP Games",
    releaseDate: "2003-05-06",
    description:
      "EVE Online is a free-to-play sci-fi MMORPG famous for its player-driven stories of conquest, betrayal, and epic space battles involving thousands of players. Mine, trade, pirate, manufacture, explore, or wage war across a single-shard persistent galaxy — every ship you see is a real player.",
    shortDescription:
      "Free-to-play sci-fi MMORPG. Single-shard persistent galaxy, player-driven economy + politics, epic space battles of thousands.",
    genres: ["MMORPG", "Space Sim", "Sandbox", "Online Multiplayer"],
    tags: ["Free to Play", "Online Multiplayer", "Player Economy"],
    rating: 4.4,
    ratingCount: 142_810,
    sizeBytes: 18_000_000_000,
    coverImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/8500/header.jpg",
    bannerImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/8500/library_600x900.jpg",
    heroImage: "https://cdn.cloudflare.steamstatic.com/steam/apps/8500/library_hero.jpg",
    license: "free",
    officialUrl: "https://www.eveonline.com",
    repacks: [
      repack("eve-steam", "Steam · Latest · Win x64", "official", "Official", 18_000_000_000, 1, { seeders: 9999, leechers: 142, quality: "Steam installer · Win x64", languages: ["English", "Multi-10"] }),
      repack("eve-standalone", "EVE Launcher · Win/Mac x64", "official", "Official", 17_000_000_000, 7, { seeders: 7240, leechers: 121, quality: "Direct launcher · Win/Mac x64", languages: ["English", "Multi-10"] }),
    ],
  },
];

const ALL_GENRES = Array.from(new Set(STORE_CATALOG.flatMap((g) => g.genres))).sort();
export const STORE_GENRES = ALL_GENRES;

// All distinct download source names (for the "Filter by source" drawer).
const ALL_SOURCE_NAMES = Array.from(
  new Set(STORE_CATALOG.flatMap((g) => g.repacks.map((r) => r.downloadSourceName))),
).sort();
export const STORE_SOURCE_NAMES = ALL_SOURCE_NAMES;

// Per-category colors for filter orbs (Hydra-style distinct hues).
export const FILTER_COLORS: Record<string, string> = {
  Genres: "hsl(262 50% 47%)",
  Tags: "hsl(95 50% 20%)",
  Sources: "hsl(27 50% 40%)",
  Developers: "hsl(340 50% 46%)",
  Publishers: "hsl(200 50% 30%)",
};

// Per-source badge colors.
export const SOURCE_BADGE_COLORS: Record<string, string> = {
  Official: "rgba(74,222,128,.18);color:#86efac;border:1px solid rgba(74,222,128,.35)",
  "GOG Games": "rgba(155,89,182,.18);color:#d8b4fe;border:1px solid rgba(155,89,182,.35)",
  FitGirl: "rgba(244,63,94,.18);color:#fda4af;border:1px solid rgba(244,63,94,.35)",
  OnlineFix: "rgba(34,211,238,.18);color:#7dd3fc;border:1px solid rgba(34,211,238,.35)",
  Xatab: "rgba(249,115,22,.18);color:#fdba74;border:1px solid rgba(249,115,22,.35)",
  DODI: "rgba(251,191,36,.18);color:#fde68a;border:1px solid rgba(251,191,36,.35)",
};

export function findStoreGame(id: string): StoreGame | undefined {
  return STORE_CATALOG.find((g) => g.id === id);
}

export function searchStore(filters: {
  query: string;
  genre: string;
  sources: string[]; // selected download source names
  sort: StoreSortKey;
}): StoreGame[] {
  const q = filters.query.trim().toLowerCase();
  const list = STORE_CATALOG.filter((g) => {
    if (q) {
      const hay = `${g.title} ${g.developer} ${g.genres.join(" ")} ${g.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.genre && !g.genres.includes(filters.genre)) return false;
    if (filters.sources.length > 0) {
      const has = g.repacks.some((r) => filters.sources.includes(r.downloadSourceName));
      if (!has) return false;
    }
    return true;
  });

  const sorters: Record<StoreSortKey, (a: StoreGame, b: StoreGame) => number> = {
    popularity: (a, b) => (b.repacks[0]?.seeders ?? 0) - (a.repacks[0]?.seeders ?? 0),
    newest: (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime(),
    oldest: (a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime(),
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
    rating_high: (a, b) => b.rating - a.rating,
    rating_low: (a, b) => a.rating - b.rating,
  };
  list.sort(sorters[filters.sort]);
  return list;
}

// Helper: compute the availability status of a repack based on its uris.
// Returns "online" (all uris available), "partial" (some unavailable), or "offline" (all unavailable).
export function repackAvailability(r: StoreRepack): "online" | "partial" | "offline" {
  if (r.unavailableUris.length === 0) return "online";
  if (r.unavailableUris.length >= r.uris.length) return "offline";
  return "partial";
}
