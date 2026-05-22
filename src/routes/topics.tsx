/* SEO landing pages — server-rendered, deeply-linked, JSON-LD-tagged.
 *
 * Each topic targets a high-volume Martha Stewart search query. The page
 * queries episodes that match the topic (by tag / topic / theme / guest / show
 * / fulltext), renders them with rich context, and emits structured data so
 * search engines and LLM crawlers (GPTBot, ClaudeBot, PerplexityBot,
 * Google-Extended, CCBot) can ingest the page cleanly.
 *
 * The route lives at /topics/<slug>. The index at /topics lists them all.
 */
import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { sql } from "../db/client.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { canonical, collectionPageJsonLd, itemListJsonLd, breadcrumbsJsonLd, siteHost } from "../lib/seo.js";
import { formatDate } from "../views/components/EpisodeCard.js";

export const topicsRoute = new Hono();

type TopicMatch =
  | { kind: "tag"; values: string[] }
  | { kind: "topic"; values: string[] }
  | { kind: "theme"; values: string[] }
  | { kind: "guest"; values: string[] }
  | { kind: "show"; values: string[] }
  | { kind: "fulltext"; patterns: string[] };

export type Topic = {
  slug: string;
  h1: string;
  // <title> + og:title. Front-loaded with the search query a user would type.
  metaTitle: string;
  // <meta name="description"> — 140–160 chars, conversational, fact-rich.
  metaDescription: string;
  // Page intro paragraph (rendered as <p>).
  lede: string;
  // Body prose paragraphs — these are the cited substance for LLM crawlers.
  body: string[];
  // How to match episodes — first matcher with hits wins; otherwise unioned.
  match: TopicMatch[];
  // Keywords to surface in <meta name="keywords"> and the related-search links.
  relatedQueries: string[];
};

// The 20 topics. Curated against the search-trend research summarised in
// FUTURE-TODO.md and against the actual tag distribution in our DB.
export const TOPICS: Topic[] = [
  {
    slug: "thanksgiving-episodes",
    h1: "Every Martha Stewart Thanksgiving Episode",
    metaTitle: "Martha Stewart Thanksgiving Episodes — Complete Archive",
    metaDescription:
      "Every Thanksgiving episode Martha Stewart has hosted: turkey trussing, brining, mashed-potato sides, pies, and entertaining. Sorted by air date across all 12 programs.",
    lede:
      "Martha Stewart has cooked, demonstrated, or hosted some part of Thanksgiving on television nearly every year since 1993. This page collects every Thanksgiving-tagged episode across all 12 programs.",
    body: [
      "Across Martha Stewart Living, The Martha Stewart Show, Martha Bakes, Martha Cooks, Martha Knows Best, and Martha & Snoop's Potluck Dinner Party, Thanksgiving recurs as the single most-covered holiday in the archive.",
      "The episodes range from full-day turkey-day specials (cornbread stuffing, sausage and pear stuffing, brining, deep-frying, carving) to single-dish demos (Martha's deep-dish pumpkin pie, cream cheese mashed potatoes, brussels sprouts with bacon, cranberry-orange relish).",
      "For make-ahead planning, look for the Bakes episodes on pie crusts and the Cooks episodes on side-dish prep timelines. The Snoop's Potluck Thanksgiving features Naya Rivera, Chris Bosh, and 2 Chainz.",
    ],
    match: [
      { kind: "tag", values: ["thanksgiving"] },
      { kind: "topic", values: ["thanksgiving", "turkey"] },
      { kind: "fulltext", patterns: ["thanksgiving", "turkey day"] },
    ],
    relatedQueries: ["turkey", "stuffing", "cranberry", "pumpkin pie", "side dishes", "holiday entertaining"],
  },
  {
    slug: "christmas-episodes",
    h1: "Every Martha Stewart Christmas Episode",
    metaTitle: "Martha Stewart Christmas Episodes — Cookies, Trees, Wreaths & Recipes",
    metaDescription:
      "Every Christmas episode in the Martha Stewart archive: cookies, gingerbread, tree-trimming, wreaths, ornaments, holiday hams, and entertaining. All 12 programs, sorted by year.",
    lede:
      "Christmas is the second-most-documented season in the Martha Stewart archive after Thanksgiving — a multi-decade record of cookie swaps, gingerbread houses, ornament crafts, and holiday entertaining.",
    body: [
      "Martha's Christmas episodes lean into three through-lines: baking (spritz cookies, gingerbread, fruitcake, panettone), craft (handmade ornaments, paper snowflakes, wrapping techniques, wreaths), and entertaining (the dinner spread, the ham, the cocktail).",
      "Martha Bakes devotes large stretches of its later seasons to Christmas cookie technique. Martha & Snoop's Potluck has multiple Christmas catfish episodes featuring Jason Derulo and Jamie Chung.",
      "Martha Holidays — a dedicated specials format — concentrates the Christmas content into hour-long entertaining showcases that pair recipes with tabletop and home-decor segments.",
    ],
    match: [
      { kind: "tag", values: ["christmas", "holiday"] },
      { kind: "topic", values: ["christmas"] },
      { kind: "fulltext", patterns: ["christmas", "gingerbread", "yule"] },
    ],
    relatedQueries: ["cookies", "gingerbread", "wreath", "tree-trimming", "holiday ham", "eggnog"],
  },
  {
    slug: "halloween-episodes",
    h1: "Every Martha Stewart Halloween Episode",
    metaTitle: "Martha Stewart Halloween Episodes — Pumpkins, Costumes & Spooky Crafts",
    metaDescription:
      "Martha Stewart's Halloween episodes: pumpkin-carving, costumes, edible treats, spider webs, gravestones, and her famous black-and-orange entertaining. Every show, sorted by year.",
    lede:
      "Halloween is Martha's craft showcase. The archive's Halloween episodes are concentrated on Martha Stewart Living (the original program) and the Martha Stewart Show, with strong support from Martha Holidays.",
    body: [
      "Common segments: pumpkin carving (artist-level templates), edible treats (caramel apples, spider-web cupcakes, candy-corn-themed cookies), costume crafts (no-sew, classroom-friendly, family-themed), and table-setting (black-and-orange, gourd centerpieces, candle treatments).",
      "Martha pairs Halloween crafts with the gardening cycle — pumpkin growing, gourd selection, and the move from late-summer harvest into the holiday season.",
    ],
    match: [
      { kind: "tag", values: ["halloween"] },
      { kind: "topic", values: ["halloween"] },
      { kind: "fulltext", patterns: ["halloween", "haunted", "jack-o"] },
    ],
    relatedQueries: ["pumpkin carving", "costume", "spooky treats", "caramel apple", "candy"],
  },
  {
    slug: "easter-episodes",
    h1: "Martha Stewart Easter Episodes",
    metaTitle: "Martha Stewart Easter Episodes — Lamb, Ham, Eggs & Brunch",
    metaDescription:
      "Martha Stewart's Easter episodes: hot-cross buns, decorated eggs, lamb, Easter ham, brunch menus, and spring entertaining. Sorted by year across all 12 programs.",
    lede:
      "Easter sits at the intersection of Martha's two strongest themes: spring gardening and brunch entertaining. The archive's Easter episodes hit both.",
    body: [
      "The signature Easter dishes — leg of lamb, glazed Easter ham, hot-cross buns, deviled eggs — recur with variation across Martha Stewart Living and The Martha Stewart Show.",
      "Egg-decorating segments make a near-yearly appearance, from natural dyes (turmeric, red cabbage, beet) to the more elaborate Ukrainian pysanky technique. Pair these episodes with the spring-gardening episodes for a coherent April programming arc.",
    ],
    match: [
      { kind: "tag", values: ["easter"] },
      { kind: "topic", values: ["easter"] },
      { kind: "fulltext", patterns: ["easter", "pysanky"] },
    ],
    relatedQueries: ["lamb", "ham", "deviled eggs", "brunch", "hot cross buns"],
  },
  {
    slug: "snoop-dogg-episodes",
    h1: "Every Martha Stewart Episode with Snoop Dogg",
    metaTitle: "Martha Stewart & Snoop Dogg Episodes — Potluck Dinner Party Complete Guide",
    metaDescription:
      "All 40 episodes of Martha & Snoop's Potluck Dinner Party (VH1, 2016–2020) plus Snoop Dogg's guest appearances across Martha's other programs.",
    lede:
      "Martha and Snoop's friendship started with a baked-mac-and-cheese segment on the Martha Stewart Show in 2008 and has produced 40 episodes of Potluck Dinner Party on VH1 (2016–2020), plus a sprawling list of guest cameos.",
    body: [
      "Potluck Dinner Party is built around the inversion: Martha is the disciplined classicist, Snoop is the improvising rapper, and every recipe gets handed off between them with a side conversation about the celebrity guest.",
      "Notable guest pairings include Seth Rogen, Ice Cube, and Wiz Khalifa (chicken episode), Naya Rivera, Chris Bosh, and 2 Chainz (Thanksgiving), and Jason Derulo and Jamie Chung (Snoop's Christmas catfish).",
      "Season 2 shifted to a competition format in which Martha and Snoop captain rival teams of celebrity guests for the Potluck Party Platter.",
    ],
    match: [
      { kind: "show", values: ["martha-and-snoops"] },
      { kind: "guest", values: ["Snoop Dogg", "Snoop"] },
      { kind: "fulltext", patterns: ["snoop dogg", "snoop"] },
    ],
    relatedQueries: ["snoop", "potluck", "vh1", "celebrity guests", "competition"],
  },
  {
    slug: "celebrity-guests",
    h1: "Celebrity Guests on Martha Stewart's Shows",
    metaTitle: "Celebrity Guests on Martha Stewart — Episodes by Famous Visitor",
    metaDescription:
      "Every notable celebrity guest appearance across Martha Stewart's twelve programs — actors, musicians, athletes, chefs, and politicians who cooked or crafted on-air.",
    lede:
      "Martha's daytime franchise has hosted hundreds of celebrity guests over four decades. This page collects the episodes with the most-searched-for guests.",
    body: [
      "Persistent guest categories: chefs (Julia Child, Jacques Pépin, Emeril Lagasse, Bobby Flay), musicians (Snoop Dogg, Diddy, Jason Derulo, Wiz Khalifa), actors (Seth Rogen, Drew Barrymore), athletes (Chris Bosh, Carmelo Anthony), and figures from Martha's own circle (Susan Magrino, Kevin Sharkey).",
      "The Martha Stewart Show (2005–2012) is the deepest source of celebrity-guest episodes, with the syndicated daytime format running multi-guest hours. Martha & Snoop's Potluck has the densest celebrity cameo rate per episode.",
    ],
    match: [
      { kind: "guest", values: ["%"] },
      { kind: "fulltext", patterns: ["guest", "joined by"] },
    ],
    relatedQueries: ["snoop dogg", "julia child", "diddy", "jacques pepin", "seth rogen", "bobby flay"],
  },
  {
    slug: "julia-child-episodes",
    h1: "Martha Stewart & Julia Child — Together on Air",
    metaTitle: "Martha Stewart and Julia Child Episodes — Cooking Together",
    metaDescription:
      "The Martha Stewart episodes featuring Julia Child: legendary cross-generational kitchen segments, French classics, and Julia's last television appearances.",
    lede:
      "Martha hosted Julia Child multiple times in the 1990s and 2000s. The collaborations remain some of the most-cited episodes in the archive.",
    body: [
      "The Martha-Julia segments paired Martha's editorial precision with Julia's improvisational French technique — the two cooked roasted poultry, classic sauces, and several joint demonstrations of pastry doughs.",
      "Search this collection for any Julia Child appearance across Martha Stewart Living (the original program) and the Martha Stewart Show.",
    ],
    match: [
      { kind: "guest", values: ["Julia Child"] },
      { kind: "fulltext", patterns: ["julia child"] },
    ],
    relatedQueries: ["french cooking", "pastry", "roast chicken", "julia child"],
  },
  {
    slug: "cookies",
    h1: "Martha Stewart's Cookie Episodes",
    metaTitle: "Martha Stewart Cookie Episodes — Recipes, Techniques & Holiday Cookies",
    metaDescription:
      "Every Martha Stewart cookie episode: chocolate chip, sugar, spritz, gingerbread, shortbread, biscotti, and Christmas-cookie swaps. Across Martha Bakes and The Martha Stewart Show.",
    lede:
      "Cookies are Martha Bakes's anchor format — the show returns to cookie technique each season — and the topic recurs constantly on Martha Stewart Living and the Martha Stewart Show.",
    body: [
      "Look here for the canonical Martha recipes: chocolate-chip (with chilled dough and brown butter variations), sugar cookies, spritz cookies, gingerbread, biscotti, shortbread, snickerdoodles, and the annual Christmas-cookie episodes.",
      "Martha Bakes treats cookies as a technique-led course: episodes drill into dough hydration, butter temperature, sheet-pan rotation, and storage. Pair with the holiday episodes for cookie-swap programming.",
    ],
    match: [
      { kind: "tag", values: ["cookies", "cookie", "baking"] },
      { kind: "topic", values: ["cookies"] },
      { kind: "fulltext", patterns: ["cookie", "shortbread", "biscotti", "gingerbread"] },
    ],
    relatedQueries: ["chocolate chip", "shortbread", "spritz", "gingerbread", "biscotti", "christmas cookies"],
  },
  {
    slug: "pumpkin-recipes",
    h1: "Martha Stewart's Pumpkin Episodes",
    metaTitle: "Martha Stewart Pumpkin Episodes — Pie, Soup, Bread & Carving",
    metaDescription:
      "Martha Stewart's pumpkin episodes: deep-dish pumpkin pie, pumpkin soup, pumpkin bread, pumpkin pasta, and Halloween pumpkin-carving. From all 12 programs.",
    lede:
      "Pumpkin is Martha's bridge ingredient between Halloween and Thanksgiving. The archive treats it as a year-round subject with a sharp October-to-November peak.",
    body: [
      "Recipes recur across the years: Martha's deep-dish pumpkin pie, butternut-and-pumpkin soup, pumpkin bread, pumpkin pasta, pumpkin cheesecake, and the seasonal pumpkin spice variations.",
      "On the craft side, expect the Halloween pumpkin-carving episodes and the autumn gourd-centerpiece segments that often appear alongside the recipe demos.",
    ],
    match: [
      { kind: "tag", values: ["pumpkin"] },
      { kind: "topic", values: ["pumpkin"] },
      { kind: "fulltext", patterns: ["pumpkin"] },
    ],
    relatedQueries: ["pumpkin pie", "pumpkin soup", "halloween", "thanksgiving", "squash"],
  },
  {
    slug: "pie-recipes",
    h1: "Martha Stewart's Pie Episodes",
    metaTitle: "Martha Stewart Pie Recipes — Apple, Pumpkin, Cherry, Pecan & More",
    metaDescription:
      "Every Martha Stewart pie episode: apple, pumpkin, cherry, pecan, key lime, lemon meringue, pot pie, and the foundational crust techniques. Across Martha Bakes and Martha Stewart Living.",
    lede:
      "Pie is one of Martha Bakes's signature subjects. The show devotes whole episodes to crust technique — the all-butter, the lard-shortening hybrid, the pâte brisée — before moving to specific pies.",
    body: [
      "Holiday pies dominate: deep-dish pumpkin, classic pecan, apple lattice, mince. Summer pies (cherry, blueberry, peach) appear on Martha Stewart Living's mid-season episodes. Savoury pies — chicken pot pie, beef Wellington — are categorized here too.",
    ],
    match: [
      { kind: "tag", values: ["pie", "pies", "baking"] },
      { kind: "topic", values: ["pie"] },
      { kind: "fulltext", patterns: ["pie", "tart"] },
    ],
    relatedQueries: ["apple pie", "pumpkin pie", "pecan pie", "pie crust", "tart"],
  },
  {
    slug: "bread-recipes",
    h1: "Martha Stewart's Bread Episodes",
    metaTitle: "Martha Stewart Bread Episodes — Sourdough, Brioche, Focaccia & Rolls",
    metaDescription:
      "Martha Stewart's bread-baking episodes: sourdough starter, brioche, focaccia, no-knead, cornbread, dinner rolls, and holiday breads.",
    lede:
      "Martha Bakes anchors the bread coverage with multi-episode arcs on yeast technique, sourdough starter care, and laminated doughs. Martha Stewart Living adds quick breads, cornbread, and dinner rolls.",
    body: [
      "Look here for the foundational techniques (autolyse, the stretch-and-fold, the cold ferment), the classic loaves (boule, baguette, brioche, focaccia, ciabatta), and the holiday breads (challah, panettone, Christmas stollen, hot cross buns).",
    ],
    match: [
      { kind: "tag", values: ["bread", "baking"] },
      { kind: "topic", values: ["bread"] },
      { kind: "fulltext", patterns: ["bread", "sourdough", "brioche", "focaccia"] },
    ],
    relatedQueries: ["sourdough", "brioche", "focaccia", "challah", "cornbread"],
  },
  {
    slug: "cake-recipes",
    h1: "Martha Stewart's Cake Episodes",
    metaTitle: "Martha Stewart Cake Recipes — Wedding, Birthday, Layered & Pound Cakes",
    metaDescription:
      "Martha Stewart's cake-baking episodes: wedding cakes, birthday cakes, layered cakes, pound cakes, cheesecakes, and her famous fondant and buttercream techniques.",
    lede:
      "Cake is Martha's set-piece: the wedding cake demos, the birthday-cake hour, the precision frosting technique. Martha Bakes Season 5 is the canonical wedding-cake arc.",
    body: [
      "Categories represented here: layer cakes (vanilla, chocolate, red velvet), pound cakes, bundts, cheesecakes (New York-style, Italian ricotta), fruit cakes, and the wedding-cake assembly episodes that pair flavour with structural engineering.",
    ],
    match: [
      { kind: "tag", values: ["cake", "cakes", "wedding cake", "baking"] },
      { kind: "topic", values: ["cake"] },
      { kind: "fulltext", patterns: ["cake", "frosting", "buttercream"] },
    ],
    relatedQueries: ["wedding cake", "birthday cake", "cheesecake", "pound cake", "frosting"],
  },
  {
    slug: "mac-and-cheese",
    h1: "Martha Stewart's Mac and Cheese Episodes",
    metaTitle: "Martha Stewart Mac and Cheese Recipe Episodes",
    metaDescription:
      "Martha Stewart's macaroni and cheese episodes — including the legendary baked mac and cheese with white cheddar, Gruyère, cayenne, and a torn-crouton top.",
    lede:
      "The Martha mac-and-cheese formula — white cheddar, Gruyère, cayenne, nutmeg, torn-crouton top — sits at the center of Martha-the-cookbook-author and is the recipe most associated with her popular reputation.",
    body: [
      "The original baked mac-and-cheese segment aired on Martha Stewart Living and was re-staged on the Martha Stewart Show in the celebrated Snoop Dogg pairing. The recipe is also the throughline in several Martha Bakes pasta episodes.",
    ],
    match: [
      { kind: "fulltext", patterns: ["macaroni and cheese", "mac and cheese", "mac-and-cheese", "baked macaroni"] },
    ],
    relatedQueries: ["snoop dogg", "baked pasta", "cheddar", "gruyere", "comfort food"],
  },
  {
    slug: "italian-cooking",
    h1: "Martha Stewart's Italian Cooking Episodes",
    metaTitle: "Martha Stewart Italian Recipes — Pasta, Pizza, Risotto & Antipasti",
    metaDescription:
      "Martha Stewart's Italian-cooking episodes: handmade pasta, risotto, pizza, antipasti, osso bucco, Italian Christmas, and the one-pan-pasta technique.",
    lede:
      "Italian cuisine is one of the most-covered regional categories in the archive. Pasta, pizza, risotto, and Italian-American classics recur across Martha Bakes, Martha Cooks, and the Martha Stewart Show.",
    body: [
      "Notable subjects: handmade pasta (cavatelli, orecchiette, pappardelle), the famous one-pan pasta technique, risotto (Milanese, mushroom, seafood), pizza technique, panettone, biscotti, and Italian-style Christmas Eve seafood feasts.",
    ],
    match: [
      { kind: "tag", values: ["italian"] },
      { kind: "topic", values: ["italian"] },
      { kind: "fulltext", patterns: ["italian", "italy", "pasta", "risotto"] },
    ],
    relatedQueries: ["pasta", "pizza", "risotto", "italy", "one-pan pasta"],
  },
  {
    slug: "french-cooking",
    h1: "Martha Stewart's French Cooking Episodes",
    metaTitle: "Martha Stewart French Recipes — Pastry, Sauces, Bistro Classics",
    metaDescription:
      "Martha Stewart's French-cuisine episodes: pastry technique, mother sauces, coq au vin, bistro classics, Parisian travel segments, and her work with Julia Child and Jacques Pépin.",
    lede:
      "French cuisine — pastry technique, the mother sauces, the bistro repertoire — is one of Martha's most personal subjects on television.",
    body: [
      "The archive's French-cooking episodes track Martha's earliest restaurant training, her travel segments in Paris and the south of France, and her on-air collaborations with Julia Child and Jacques Pépin.",
      "Look for the pâte brisée and pâte sucrée episodes on Martha Bakes; the coq au vin, beef bourguignon, and cassoulet on Martha Cooks; and the croissant/laminated-dough sequence on Martha Bakes.",
    ],
    match: [
      { kind: "tag", values: ["french"] },
      { kind: "topic", values: ["french"] },
      { kind: "fulltext", patterns: ["french", "france", "paris", "bistro"] },
    ],
    relatedQueries: ["julia child", "jacques pepin", "croissant", "bistro", "paris"],
  },
  {
    slug: "mexican-cooking",
    h1: "Martha Stewart's Mexican Cooking Episodes",
    metaTitle: "Martha Stewart Mexican Recipes — Tacos, Mole, Tamales & Margaritas",
    metaDescription:
      "Martha Stewart's Mexican-cuisine episodes: tacos, enchiladas, mole, tamales, margaritas, and her Oaxaca and Mexico City travel segments.",
    lede:
      "Mexican cuisine is a steady mid-list category in the archive, with peaks around Cinco de Mayo and summer entertaining. The episodes cover both Tex-Mex classics and regional Mexican cooking.",
    body: [
      "Look for the mole episodes (most thoroughly developed on Martha Cooks), the tamale-assembly episodes (commonly Christmas-coded in the Mexican-American tradition), and the margarita and tequila segments tied to the entertaining theme.",
    ],
    match: [
      { kind: "tag", values: ["mexican"] },
      { kind: "topic", values: ["mexican"] },
      { kind: "fulltext", patterns: ["mexican", "mexico", "taco", "mole", "tamale"] },
    ],
    relatedQueries: ["tacos", "mole", "tamales", "margarita", "mexico", "cinco de mayo"],
  },
  {
    slug: "in-maine",
    h1: "Martha Stewart in Maine",
    metaTitle: "Martha Stewart Maine Episodes — Skylands, Mount Desert Island, Lobster",
    metaDescription:
      "Martha Stewart's Maine episodes filmed at Skylands on Mount Desert Island: lobster boils, blueberry picking, garden tours, and the coastal-Maine entertaining segments.",
    lede:
      "Martha's Maine home — Skylands, on Mount Desert Island — is a recurring set across Martha Stewart Living and the Martha Stewart Show.",
    body: [
      "The Maine episodes lean into ingredients (lobster, blueberries, fiddleheads, sea salt), travel (the Acadia/Bar Harbor day trips, the boat segments), and the Skylands tours (kitchen, garden, greenhouse).",
      "Search this page for the canonical lobster-roll episode, the Maine blueberry pie, and the Skylands garden tour series.",
    ],
    match: [
      { kind: "tag", values: ["maine", "skylands"] },
      { kind: "topic", values: ["maine"] },
      { kind: "fulltext", patterns: ["maine", "skylands", "mount desert", "acadia", "bar harbor"] },
    ],
    relatedQueries: ["lobster", "skylands", "blueberry", "acadia", "summer"],
  },
  {
    slug: "gardening-episodes",
    h1: "Martha Stewart's Gardening Episodes",
    metaTitle: "Martha Stewart Gardening Episodes — Vegetables, Flowers, Pruning & Compost",
    metaDescription:
      "Martha Stewart's gardening episodes: vegetable beds, cutting gardens, pruning, compost, greenhouse, peonies, tomatoes, and the Bedford and Skylands garden tours.",
    lede:
      "Gardening is a defining Martha subject — the Bedford property, the Skylands garden, the East Hampton beds, the New York cutting flowers. The archive's gardening episodes span every season.",
    body: [
      "Look for the spring-planting episodes (seed-starting, raised beds, the chicken coop), the high-summer episodes (tomatoes, peonies, dahlias), and the autumn-prep episodes (pruning, compost, garlic).",
      "Martha Gets Down and Dirty (the dedicated gardening-led format) is the densest source. Bedford and Skylands tours recur on the flagship programs.",
    ],
    match: [
      { kind: "tag", values: ["garden", "gardening"] },
      { kind: "show", values: ["martha-gets-down-and-dirty"] },
      { kind: "topic", values: ["gardening"] },
      { kind: "fulltext", patterns: ["garden", "compost", "pruning", "greenhouse", "peony", "tomato plant"] },
    ],
    relatedQueries: ["tomatoes", "peonies", "compost", "raised beds", "skylands", "bedford"],
  },
  {
    slug: "craft-episodes",
    h1: "Martha Stewart's Craft Episodes",
    metaTitle: "Martha Stewart Craft Episodes — Knitting, Pottery, Paper & DIY",
    metaDescription:
      "Martha Stewart's craft episodes: knitting, pottery, paper crafts, wrapping, decoupage, candle-making, and the seasonal holiday-craft segments.",
    lede:
      "Craft is the original Martha franchise — the magazine's first cover identity. The TV archive translates that into hundreds of how-to craft segments.",
    body: [
      "Recurring formats: knitting (scarves, hats, fair-isle), pottery (wheel-throwing, glazing, hand-built), paper crafts (decoupage, origami, hand-cut snowflakes), wrapping technique, candle-making, and seasonal wreaths.",
    ],
    match: [
      { kind: "tag", values: ["craft", "crafts", "knitting", "pottery"] },
      { kind: "topic", values: ["crafts"] },
      { kind: "fulltext", patterns: ["craft", "knitting", "pottery", "decoupage", "wreath"] },
    ],
    relatedQueries: ["knitting", "pottery", "wrapping", "decoupage", "wreaths"],
  },
  {
    slug: "wedding-episodes",
    h1: "Martha Stewart's Wedding Episodes",
    metaTitle: "Martha Stewart Wedding Episodes — Cakes, Flowers, Planning & Receptions",
    metaDescription:
      "Martha Stewart's wedding episodes: wedding cakes, bridal flowers, reception menus, dress shopping, and the legendary Martha Stewart Weddings programming.",
    lede:
      "Weddings are an entire Martha subgenre — Martha Stewart Weddings the magazine spun an entire programming pillar across the TV shows, from Bakes's wedding-cake episodes to the dedicated reception planners.",
    body: [
      "Look here for the wedding-cake assembly episodes (Martha Bakes Season 5 is the showpiece), the bridal-flowers segments (Bedford and Skylands settings), the menu-planning episodes, and the dress-and-veil segments on the Martha Stewart Show.",
    ],
    match: [
      { kind: "tag", values: ["wedding", "weddings"] },
      { kind: "topic", values: ["wedding"] },
      { kind: "fulltext", patterns: ["wedding", "bridal"] },
    ],
    relatedQueries: ["wedding cake", "bridal flowers", "reception", "vows", "marriage"],
  },
];

// ── Build a SQL WHERE fragment from a topic's match list ──────────────────
// First non-empty matcher wins; the rest are OR-combined with it.
function buildMatcher(t: Topic) {
  const parts: any[] = [];
  for (const m of t.match) {
    if (m.kind === "tag") {
      parts.push(sql`EXISTS (SELECT 1 FROM episode_tags et WHERE et.episode_id = e.id AND et.tag = ANY(${m.values}))`);
    } else if (m.kind === "topic") {
      parts.push(sql`EXISTS (SELECT 1 FROM episode_topics et WHERE et.episode_id = e.id AND et.topic = ANY(${m.values}))`);
    } else if (m.kind === "theme") {
      parts.push(sql`EXISTS (SELECT 1 FROM episode_themes et WHERE et.episode_id = e.id AND et.theme = ANY(${m.values}))`);
    } else if (m.kind === "guest") {
      // Pattern match so partial names like "Snoop" still hit "Snoop Dogg"
      const pats = m.values.map((v) => `%${v}%`);
      parts.push(sql`EXISTS (SELECT 1 FROM episode_guests g WHERE g.episode_id = e.id AND g.name ILIKE ANY(${pats}))`);
    } else if (m.kind === "show") {
      parts.push(sql`e.show_slug = ANY(${m.values})`);
    } else if (m.kind === "fulltext") {
      const pats = m.patterns.map((p) => `%${p}%`);
      parts.push(sql`(e.title ILIKE ANY(${pats}) OR e.description ILIKE ANY(${pats}))`);
    }
  }
  if (!parts.length) return sql`FALSE`;
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) out = sql`(${out} OR ${parts[i]})`;
  return out;
}

const TOPIC_INDEX = new Map(TOPICS.map((t) => [t.slug, t]));

export function getAllTopicSlugs(): string[] {
  return TOPICS.map((t) => t.slug);
}

// ── /topics — landing-page index ──────────────────────────────────────────
topicsRoute.get("/topics", async (c) => {
  const [lastImport, counts] = await Promise.all([fetchLastImport(), fetchRowCounts()]);

  const ld = collectionPageJsonLd({
    url: canonical("/topics"),
    name: "Topics — Martha Stewart Episode Archive",
    description: "Topic-led indexes into Martha Stewart's twelve programs: holidays, ingredients, cuisines, and recurring guests.",
    itemCount: TOPICS.length,
  });

  return c.html(
    <Layout
      title="Topics — Martha Stewart Episode Archive"
      description="Holiday, recipe, cuisine, guest, and location indexes into every Martha Stewart episode from 1993 to today."
      canonical={canonical("/topics")}
      jsonLd={[ld, breadcrumbsJsonLd([
        { name: "Archive", url: siteHost() },
        { name: "Topics", url: canonical("/topics") },
      ])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--prose" style="padding-top:var(--space-4);">
        <header class="hero">
          <p class="smallcap-eyebrow">Topics</p>
          <h1 class="display">Browse by topic</h1>
          <p class="lede">
            Twenty curated indexes into the archive — holidays, ingredients, cuisines, guests, and the places Martha has filmed from.
          </p>
        </header>

        <ul style="list-style:none;padding:0;margin-top:var(--space-4);columns:2;column-gap:var(--space-5);">
          {TOPICS.map((t) => (
            <li style="break-inside:avoid;margin-bottom:var(--space-3);">
              <a href={`/topics/${t.slug}`} style="text-decoration:none;">
                <strong class="serif-title" style="display:block;font-size:1.05rem;">{t.h1}</strong>
                <span class="caption">{t.metaDescription.slice(0, 110)}…</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Layout>,
  );
});

// ── /topics/:slug — individual topic landing page ─────────────────────────
topicsRoute.get("/topics/:slug", async (c) => {
  const slug = c.req.param("slug");
  const t = TOPIC_INDEX.get(slug);
  if (!t) return c.notFound();

  const matcher = buildMatcher(t);
  const PAGE_SIZE = 60;

  const rows = await sql<Array<{
    id: string;
    title: string;
    description: string | null;
    air_date: string | null;
    air_year: number | null;
    air_precision: string | null;
    season: number | null;
    episode_number: number | null;
    photo_url: string | null;
    runtime_minutes: number | null;
    show_slug: string | null;
    show_name: string | null;
    guests: string[];
  }>>`
    SELECT e.id, e.title, e.description,
           e.air_date::text AS air_date, e.air_year, e.air_precision,
           e.season, e.episode_number, e.photo_url, e.runtime_minutes,
           e.show_slug, e.show_name,
           COALESCE((SELECT array_agg(name ORDER BY position) FROM episode_guests WHERE episode_id = e.id), ARRAY[]::text[]) AS guests
    FROM episodes e
    WHERE ${matcher}
    ORDER BY e.air_date DESC NULLS LAST, e.show_slug, e.season DESC, e.episode_number DESC
    LIMIT ${PAGE_SIZE}
  `;

  const totalRows = await sql<Array<{ c: number }>>`
    SELECT count(*)::int AS c FROM episodes e WHERE ${matcher}
  `;
  const total = totalRows[0]?.c ?? rows.length;

  const [lastImport, counts] = await Promise.all([fetchLastImport(), fetchRowCounts()]);
  const url = canonical(`/topics/${t.slug}`);

  const jsonLd = [
    collectionPageJsonLd({
      url,
      name: t.h1,
      description: t.metaDescription,
      itemCount: total,
    }),
    itemListJsonLd({
      url,
      name: t.h1,
      items: rows.slice(0, 30).map((r) => ({
        url: canonical(`/episodes/${r.id}`),
        name: r.title,
      })),
    }),
    breadcrumbsJsonLd([
      { name: "Archive", url: siteHost() },
      { name: "Topics", url: canonical("/topics") },
      { name: t.h1, url },
    ]),
  ];

  return c.html(
    <Layout
      title={t.metaTitle}
      description={t.metaDescription}
      canonical={url}
      og={{ title: t.metaTitle, description: t.metaDescription, url, type: "website" }}
      jsonLd={jsonLd}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <article class="page page--prose" style="padding-top:var(--space-4);">
        <p class="caption" style="margin-bottom:var(--space-2);">
          <a href="/topics" style="text-decoration:none;">← All topics</a>
        </p>
        <header class="hero">
          <p class="smallcap-eyebrow">Topic</p>
          <h1 class="display">{t.h1}</h1>
          <p class="lede">{t.lede}</p>
          <p class="caption" style="margin-top:var(--space-2);">
            {total.toLocaleString()} episodes
          </p>
        </header>

        {t.body.map((p) => (
          <p style="margin-bottom:var(--space-3);">{p}</p>
        ))}

        {t.relatedQueries.length > 0 && (
          <p class="caption" style="margin-top:var(--space-3);">
            <strong style="font-weight:600;">Related searches:</strong>{" "}
            {t.relatedQueries.map((q, i) => (
              <>
                <a href={`/episodes?q=${encodeURIComponent(q)}`} style="text-decoration:none;font-style:italic;">{q}</a>
                {i < t.relatedQueries.length - 1 ? " · " : ""}
              </>
            ))}
          </p>
        )}

        <hr class="hairline" style="margin:var(--space-5) 0;" />

        <h2 class="display-smaller" style="margin-bottom:var(--space-3);">Episodes</h2>

        {rows.length === 0 && (
          <p class="caption">
            We haven't tagged any episodes for this topic yet. Try the full
            <a href="/episodes" style="text-decoration:underline;"> archive search</a>.
          </p>
        )}

        <ol class="topic-episode-list" style="list-style:none;padding:0;margin:0;">
          {rows.map((r) => {
            const date = formatDate(r.air_date as any, r.air_year, r.air_precision);
            const showLabel = r.show_name ?? r.show_slug ?? "Episode";
            return (
              <li style="border-bottom:1px solid var(--rule-soft);padding:var(--space-2) 0;">
                <a href={`/episodes/${r.id}`} style="text-decoration:none;color:inherit;display:block;">
                  <p class="eyebrow" style="margin:0;">
                    {showLabel}
                    {r.season !== null && r.episode_number !== null ? <> · S{r.season}E{r.episode_number}</> : null}
                    {date ? <> · {date}</> : null}
                    {r.runtime_minutes ? <> · {r.runtime_minutes} min</> : null}
                  </p>
                  <h3 class="serif-title" style="font-size:1.1rem;margin:2px 0 4px;">{r.title}</h3>
                  {r.description && (
                    <p class="caption" style="margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                      {r.description.split(/\r?\n/)[0]}
                    </p>
                  )}
                  {r.guests && r.guests.length > 0 && (
                    <p class="caption" style="margin:4px 0 0;font-style:italic;">
                      with {r.guests.slice(0, 3).join(", ")}
                      {r.guests.length > 3 ? ` and ${r.guests.length - 3} more` : ""}
                    </p>
                  )}
                </a>
              </li>
            );
          })}
        </ol>

        {total > rows.length && (
          <p class="caption" style="margin-top:var(--space-3);">
            Showing the {rows.length} most recent of {total.toLocaleString()} matching episodes.
            See the full set via the <a href={`/episodes?q=${encodeURIComponent(t.relatedQueries[0] ?? t.slug)}`} style="text-decoration:underline;">archive search</a>.
          </p>
        )}
      </article>
    </Layout>,
  );
});
