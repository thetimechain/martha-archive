// MSL TV entity extraction: people (collaborators, chefs) + places (businesses, farms,
// museums, field-trip destinations) from marthastewart.tv vhx data.
//
// Sources (in priority order):
//   1. Collection memberships — e.g. `petkeeping-with-marc-morrone` credits Marc Morrone
//      for every item; `big-martha-kostyra-s-family-favorite-recipes` credits Mrs. Kostyra.
//   2. Curated allowlist of known recurring contributors + biographical context.
//   3. Pattern extraction from segment descriptions:
//      - "...with Mrs. Kostyra" / "...with Salli" → resolve to known full names
//      - "FT - <subject>" / "Field Trip: <subject>" → field-trip destinations
//      - "<Title-cased phrase> Bakery|Farm|Hatchery|Museum|…" → businesses
//
// Output:
//   data/marthastewart-tv/entities.json  — { people: [], places: [], appearances: [] }
//
// Companion script `mst-persist-entities.mjs` writes the rows to Postgres.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW_DIR = "data/marthastewart-tv/raw";
const ITEMS_JSON = "data/marthastewart-tv/items.json";
const OUT = "data/marthastewart-tv/entities.json";

// ─────────────────────────────────────────────────────────────────────────────
// Curated allowlist of recurring MSL TV contributors.
//
// Each entry: canonical full name, slug, kind ("contributor" | "chef" | "family" | "guest"),
// role description, and "aliases" (first names or partial spellings as they appear in segment lists).
// Aliases match word-boundaries (case-insensitive). If `requires` is set, the alias only
// counts in lines that also contain one of those keywords (e.g. "Hannah" only credits Hannah
// Milman in craft segments).
// ─────────────────────────────────────────────────────────────────────────────
const PEOPLE = [
  {
    name: "Mrs. Kostyra",
    slug: "mrs-kostyra",
    kind: "family",
    role: "Martha's mother Martha Kostyra (née Ruszkowski, born 1914 Buffalo, died Nov 15 2007 Norwalk CT) — known as \"Big Martha\". Polish-American matriarch of the Kostyra clan. Featured on dozens of MSL TV cooking segments demonstrating Polish family recipes — pierogi, sauerbraten, chrusciki (bow-tie cookies), babka, kielbasa, lardy cake, stuffed cabbage, blueberry buckle. Martha dedicated her cookbooks Martha Stewart's Quick Cook (1983) and Martha Stewart's Pies & Tarts (1985) to her.",
    aliases: [/\bMrs\.?\s*Kostyra\b/i, /\bBig\s*Martha\b/i, /\bMartha\s+Kostyra\b/i],
    collections: ["big-martha-kostyra-s-family-favorite-recipes", "big-martha-kostyra-s-family-favorite-recipes-1"],
  },
  {
    name: "Marc Morrone",
    slug: "marc-morrone",
    kind: "contributor",
    role: "Pet expert (born June 1 1960, the Bronx). Co-founded Parrots of the World pet shop in Rockville Centre, NY with Nick Guerra in 1978. Joined Martha Stewart Living TV in 1997 as resident pet expert; ran \"Ask Marc\", Bird Breed, Reptile Breed, Pocket Breed, Exotic Breed, Dog Breed segments. MSLO gave him his own spin-off Petkeeping with Marc Morrone (2003–2006). On-camera co-stars included Darwin (grey parrot), Harry (scarlet macaw), Coral Ann (cockatoo), Harvey (Flemish Giant rabbit), Splash (ferret), Emily (Burmese python). Memoir A Man for All Species (2010, foreword by Martha).",
    aliases: [/\bMarc\s+Morrone\b/i, /\bAsk\s+Marc\b/i],
    collections: ["petkeeping-with-marc-morrone", "petkeeping-1"],
  },
  {
    name: "Salli LaGrone",
    slug: "salli-lagrone",
    kind: "contributor",
    role: "Southern caterer and longtime friend of Martha's from their pre-TV catering days. Born Salli Shropshire May 11 1948 in Rome GA; died July 29 2011 in Franklin TN. Recurring guest on MSL TV from Season 1 — their first joint segment was a Southern fried chicken cook-off, a format Martha later recreated with Snoop Dogg. Other MSL recipes: Oyster Pie, Mushroom Pâté, Cranberry Tartlets.",
    aliases: [/\bSalli\s+LaGrone\b/i, /\bSalli\b/i],
  },
  {
    name: "Hannah Milman",
    slug: "hannah-milman",
    kind: "contributor",
    role: "Senior Vice President and Executive Editorial Director of Crafts at Martha Stewart Living Omnimedia. RISD graduate; joined the magazine at its second issue (1991) and stayed two decades. Set MSL's signature craft aesthetic — wreaths, ornaments, egg-decorating, decoupage, natural-materials décor. Co-authored Great American Wreaths: The Best of Martha Stewart Living (Clarkson Potter, 1996) with Martha and Gael Towey. On-camera segments include \"Sunflower Wreath with Hannah\".",
    aliases: [/\bHannah\s+Milman\b/i, /\bHannah\b/i],
    requires: [/craft|sewing|wreath|ribbon|origami|paper|embroidery|stamp|stencil|jewelry|beaded|decorate|valentine|halloween|christmas|easter|ornament|gift|bow|sunflower|garland|flower\s+arrangement/i],
  },
  {
    name: "Gael Towey",
    slug: "gael-towey",
    kind: "contributor",
    role: "Founding Art Director of Martha Stewart Living magazine; longtime second-in-command on the creative side. \"Origami with Gail\" segment (MSL S7 E212V) — \"Gael\" is pronounced \"Gail\".",
    aliases: [/\bGael\s+Towey\b/i, /\bOrigami\s+with\s+Gail\b/i],
  },
  {
    name: "Kit Anderson",
    slug: "kit-anderson",
    kind: "contributor",
    role: "Gardening expert and longtime contributor; led shopping-for-plants and perennials segments.",
    aliases: [/\bKit\s+Anderson\b/i, /\bwith\s+Kit\b/i],
  },
  {
    name: "Eric Ripert",
    slug: "eric-ripert",
    kind: "chef",
    role: "Chef and owner of Le Bernardin (NYC); recurring Master Chefs collaborator on seafood.",
    aliases: [/\bEric\s+Ripert\b/i],
  },
  {
    name: "Rick Bayless",
    slug: "rick-bayless",
    kind: "chef",
    role: "Chef and Mexican-cuisine expert; Frontera Grill, Chicago. Master Chefs collaborator.",
    aliases: [/\bRick\s+Bayless\b/i],
  },
  {
    name: "Diana Kennedy",
    slug: "diana-kennedy",
    kind: "chef",
    role: "Mexican-cuisine cookbook author; appeared as Master Chefs guest.",
    aliases: [/\bDiana\s+Kennedy\b/i],
  },
  {
    name: "Anne Willan",
    slug: "anne-willan",
    kind: "chef",
    role: "Founder of La Varenne cooking school; French-cuisine cookbook author. Master Chefs guest.",
    aliases: [/\bAnne\s+Willan\b/i, /\bChef\s+Anne\s+Willan\b/i],
  },
  {
    name: "Jonathan Adler",
    slug: "jonathan-adler",
    kind: "guest",
    role: "Potter and designer; visited for pottery demonstration (Jonathan Adler Pottery segment, Season 7).",
    aliases: [/\bJonathan\s+Adler\b/i],
  },
  {
    name: "Todd English",
    slug: "todd-english",
    kind: "chef",
    role: "Chef and restaurateur (Olives, Figs); appeared in Master Chefs segments demonstrating pizza dough and Italian techniques.",
    aliases: [/\bTodd\s+English\b/i, /\bwith\s+Todd\s+I\b/, /\bwith\s+Todd\b/i],
    requires: [/pizza|dough|olives?|figs?|italian|panini|tart/i],
  },
  {
    name: "Lord Wedgwood",
    slug: "lord-wedgwood",
    kind: "guest",
    role: "Lord Piers Wedgwood, 4th Baron Wedgwood — descendant of Josiah Wedgwood; appeared discussing the Wedgwood ceramics tradition.",
    aliases: [/\bLord\s+Wedgew?ood\b/i],
  },
  {
    name: "David Dawn",
    slug: "david-dawn",
    kind: "guest",
    role: "Garden featured in MSL TV — David Dawn's Garden, Hudson Valley.",
    aliases: [/\bDavid\s+Dawn\b/i],
  },
  {
    name: "Michael Romano",
    slug: "michael-romano",
    kind: "chef",
    role: "Executive chef of Union Square Cafe (NYC) from 1988; co-author with Danny Meyer of The Union Square Cafe Cookbook (1994). Featured in MSL TV \"Caesar Salad with Michael\", \"Spinach Cannelloni with Michael\", and \"Interview with Michael\" segments (e.g. MSL Season 6 Ep. 126V).",
    aliases: [/\bMichael\s+Romano\b/i, /\bInterview\s+with\s+Michael\b/i, /\bSpinach\s+Cannelloni\s+with\s+Michael\b/i, /\bCaesar\s+Salad\s+with\s+Michael\b/i],
  },
  {
    name: "Josefina Howard",
    slug: "josefina-howard",
    kind: "chef",
    role: "Founder of Rosa Mexicano (NYC, 1984). Born in Cuba, trained as a designer. Appeared on MSL TV January 1998 making avocado-orange-tequila soup with Martha; her quesadilla segment is also documented. Book: Rosa Mexicano: A Culinary Autobiography.",
    aliases: [/\bJosefina\s+Howard\b/i, /\bwith\s+Josefina\b/i],
  },
  {
    name: "Franck Deletrain",
    slug: "franck-deletrain",
    kind: "chef",
    role: "French chef in NYC (Brasserie 8½, Patroon, Café Centro). From Martha's Kitchen episode \"Franck Deletrain\" (2001). \"Steak with Franck\" segments.",
    aliases: [/\bFranck\s+Deletrain\b/i, /\bwith\s+Franck\b/i],
  },
  {
    name: "Koichi Hara",
    slug: "koichi-hara",
    kind: "guest",
    role: "Sake-tasting segment guest.",
    aliases: [/\bwith\s+Koichi\b/i],
  },
  {
    name: "Chris (Storing Linens)",
    slug: "chris-storing-linens",
    kind: "contributor",
    role: "Recurring on storing-linens segments (\"Storing Linens with Chris\").",
    aliases: [/\bStoring\s+Linens\s+with\s+Chris\b/i],
  },
  {
    name: "Leon (Standing Rib Roast)",
    slug: "leon-standing-rib-roast",
    kind: "contributor",
    role: "Recurring co-host of multi-part Standing Rib Roast segments.",
    aliases: [/\bRib\s+Roast\s+with\s+Leon\b/i],
  },
  {
    name: "Gail (Origami)",
    slug: "gail-origami",
    kind: "contributor",
    role: "Origami demonstrations (\"Origami with Gail\").",
    aliases: [/\bOrigami\s+with\s+Gail\b/i],
  },
  {
    name: "Sean (Succulent Sphere)",
    slug: "sean-succulent-sphere",
    kind: "contributor",
    role: "Succulent-sphere garden craft segments.",
    aliases: [/\bSucculent\s+Sphere\s+with\s+Sean\b/i],
  },
  {
    name: "Frances Palmer",
    slug: "frances-palmer",
    kind: "guest",
    role: "Frances Palmer Pottery (Weston, Connecticut) — celebrated ceramist known for hand-thrown earthenware, tulipieres, and dahlia vases. Longtime Martha collaborator.",
    aliases: [/\bFrances\s+Palmer\b/i],
  },
  {
    name: "Guy Wolff",
    slug: "guy-wolff",
    kind: "guest",
    role: "Guy Wolff Pottery (Bantam, CT) — hand-thrown English-style flower pots. Featured making garden pots and delivering them to Turkey Hill.",
    aliases: [/\bGuy\s+Wolff\b/i],
  },
  {
    name: "Linda Greenlaw",
    slug: "linda-greenlaw",
    kind: "guest",
    role: "Author of The Lobster Chronicles; swordboat captain featured in Sebastian Junger's The Perfect Storm. Featured in Martha's Favorite Books segment.",
    aliases: [/\bLinda\s+Greenlaw\b/i],
  },
  {
    name: "Diane Wallace",
    slug: "diane-wallace",
    kind: "guest",
    role: "Gardener featured in MSL TV (Diane Wallace's Garden field trip).",
    aliases: [/\bDiane\s+Wallace\b/i],
  },
  {
    name: "Margaret Roach",
    slug: "margaret-roach",
    kind: "contributor",
    role: "Gardening editor at Martha Stewart Living magazine; later author of A Way to Garden. Featured on MSL TV with her own garden.",
    aliases: [/\bMargaret\s+Roach\b/i],
  },
  {
    name: "Sydney Eddison",
    slug: "sydney-eddison",
    kind: "guest",
    role: "Gardener and author (Connecticut); her Newtown CT garden was a multi-part MSL TV field trip.",
    aliases: [/\bSydney\s+Eddison\b/i],
  },
  {
    name: "Thomas Hobbs",
    slug: "thomas-hobbs",
    kind: "guest",
    role: "Canadian gardener and author (Shocking Beauty); Southlands Nursery, Vancouver BC. His garden featured in multi-part field trip.",
    aliases: [/\bThomas\s+Hobbs?\b/i],
  },
  {
    name: "Eric Pike",
    slug: "eric-pike",
    kind: "contributor",
    role: "Creative Director at Martha Stewart Living Omnimedia from the magazine's founding era; longtime visual architect of MSL's aesthetic.",
    aliases: [/\bEric\s+Pike\b/i],
  },
  {
    name: "Granny Foster",
    slug: "granny-foster",
    kind: "guest",
    role: "Featured baker on MSL TV — Granny Foster's Refrigerator Rolls (Part 1 and 2).",
    aliases: [/\bGranny\s+Foster\b/i],
  },
  {
    name: "Kristin St. Clair",
    slug: "kristin-st-clair",
    kind: "contributor",
    role: "Crafter featured on MSL TV — glittered pinecone clusters and other holiday crafts.",
    aliases: [/\bKristin\s+St\.?\s*Clair\b/i],
  },
  // ── Master Chefs (deep-research identifications, 2026-05-26) ─────────────
  {
    name: "Riad Nasr",
    slug: "riad-nasr",
    kind: "chef",
    role: "Co-chef at Balthazar (NYC) and now chef-owner of Frenchette (NYC) with Lee Hanson. Earlier worked at Daniel under Boulud. MSL S5 E146V \"Balthazar Restaurant: Brandade de Morue, Braised Ribs\". Cookbook (with Hanson): Frenchette Bistro Cooking (2024).",
    aliases: [/\bRiad\s+Nasr\b/i, /\bwith\s+Riad\b/i],
  },
  {
    name: "Patricia Wells",
    slug: "patricia-wells",
    kind: "chef",
    role: "American food writer based in Paris and Provence. Books: Bistro Cooking, Patricia Wells at Home in Provence, The Provence Cookbook, The Food Lover's Guide to Paris. MSL S7 E024V (Pistou Soup, Basic Bread Dough, Herbes de Provence, Lavender Sachet).",
    aliases: [/\bPatricia\s+Wells\b/i],
  },
  {
    name: "Terrance Brennan",
    slug: "terrance-brennan",
    kind: "chef",
    role: "Chef-owner of Picholine (NYC, opened 1993; named after the green olive). Mediterranean/French. MSL S5 E363V featured his \"Sea Bass with Rhubarb Compote\" and \"Picholine Olives\". Book: Artisanal Cooking (2005).",
    aliases: [/\bTerrance\s+Brennan\b/i],
  },
  {
    name: "Scott Peacock",
    slug: "scott-peacock",
    kind: "chef",
    role: "Southern chef of Watershed (Decatur, GA); longtime partner and collaborator with Edna Lewis. Co-author with Lewis of The Gift of Southern Cooking (2003). Appeared on MSL TV demonstrating Southern Pan-Fried Chicken.",
    aliases: [/\bScott\s+Peacock\b/i],
  },
  {
    name: "Madhur Jaffrey",
    slug: "madhur-jaffrey",
    kind: "chef",
    role: "Indian cookbook author and actress. From Martha's Kitchen episode \"Indian with Madhur Jaffrey\" (2001). Books: An Invitation to Indian Cooking, Madhur Jaffrey's Indian Cookery, World Vegetarian.",
    aliases: [/\bMadhur\s+Jaffrey\b/i],
  },
  {
    name: "Egidiana Maccioni",
    slug: "egidiana-maccioni",
    kind: "chef",
    role: "\"Egi\" — consulting chef at Le Cirque and Osteria del Circo (NYC); wife of Sirio Maccioni. Tuscan home cooking. MSL S6 E044V \"Meeting Egi / Polenta with Sausage Stew / Tuscan Baked Tomatoes / Ciambella Coffee Cake\". The Maccioni Family Cookbook (2003) photos by Elizabeth Zeschin (who also shot Martha's Garden Book).",
    aliases: [/\bEgidiana\s+Maccioni\b/i, /\bMeeting\s+Egi\b/i, /\bwith\s+Egi\b/i],
  },
  {
    name: "Cesare Casella",
    slug: "cesare-casella",
    kind: "chef",
    role: "Tuscan-born NYC chef-owner of Beppe (2001) and Maremma. Known for his signature pocket of fresh herbs in his chef-coat breast pocket. MSL S5 E196V \"Tuscan Pici Pasta; Calf's Liver with Bacon and Capers\" matches his style. Books: Diary of a Tuscan Chef, True Tuscan.",
    aliases: [/\bCesare\s+Casella\b/i],
  },
  {
    name: "Daniel Boulud",
    slug: "daniel-boulud",
    kind: "chef",
    role: "Chef-owner of Daniel (NYC) and the Dinex Group. Lyon-born, classical French training. Wikipedia credits MSL TV appearances. MSL S7 E101V \"Chateaubriand\" and S7 E384V \"Pea Soup with Mint / Salmon with Sorrel / Potato Fritter with Truffles\" and S6 E074V \"Cod Cockles & Chorizo Basquaise\" all match his signatures.",
    aliases: [/\bDaniel\s+Boulud\b/i],
  },
  {
    name: "Hiroko Shimbo",
    slug: "hiroko-shimbo",
    kind: "chef",
    role: "Japanese cookbook author and consultant based in NYC; dubbed \"the Martha Stewart of Japan\". Books: The Japanese Kitchen (2000), The Sushi Experience (2006), Hiroko's American Kitchen (2012). Likely behind MSL S7 E212V \"Cooking with Miso / Making Dashi / Perfect Rice\".",
    aliases: [/\bHiroko\s+Shimbo\b/i],
  },
  {
    name: "Mark Strausman",
    slug: "mark-strausman",
    kind: "chef",
    role: "Italian-American NYC chef (Campagna, Coco Pazzo). Frequent Martha guest.",
    aliases: [/\bMark\s+Strausman\b/i],
  },
  {
    name: "Guillermo Pernot",
    slug: "guillermo-pernot",
    kind: "chef",
    role: "Chef-owner of Pasión! (Philadelphia); Nuevo Latino/ceviche specialist. From Martha's Kitchen episode (2003).",
    aliases: [/\bGuillermo\s+Pernot\b/i],
  },
  {
    name: "Mark Russ Federman",
    slug: "mark-russ-federman",
    kind: "guest",
    role: "Third-generation owner of Russ & Daughters appetizing store (Lower East Side NYC, est. 1914). \"Caviar with Mark\" segment. Martha endorsed his memoir Russ & Daughters: Reflections and Recipes from the House That Herring Built (2013) and recalled childhood visits.",
    aliases: [/\bMark\s+Russ\s+Federman\b/i, /\bCaviar\s+with\s+Mark\b/i],
  },
  {
    name: "Eli Wilner",
    slug: "eli-wilner",
    kind: "guest",
    role: "NYC's leading antique-frame specialist; Eli Wilner & Co. has framed pieces for many of Martha's homes. Likely \"Tag Sale Find with Eli\" segment.",
    aliases: [/\bEli\s+Wilner\b/i, /\bTag\s+Sale\s+Find\s+with\s+Eli\b/i],
  },
  {
    name: "Sean Conway",
    slug: "sean-conway",
    kind: "guest",
    role: "Garden designer; host of Cultivating Life (PBS). Plausible match for \"Succulent Sphere with Sean\" and \"Window Boxes with Sean\" segments.",
    aliases: [/\bSean\s+Conway\b/i],
  },
  {
    name: "Marco Polo Stufano",
    slug: "marco-polo-stufano",
    kind: "guest",
    role: "Founding Director of Horticulture at Wave Hill (Bronx, NY) from its 1965 founding. Pioneer of the New American Garden style.",
    aliases: [/\bMarco\s+Polo\s+Stufano\b/i, /\bStufano\b/i],
  },
  {
    name: "John Fairey",
    slug: "john-fairey",
    kind: "guest",
    role: "Designer and founder of Peckerwood Garden (now The John Fairey Garden) in Hempstead TX (est. 1971). Died 2020.",
    aliases: [/\bJohn\s+Fairey\b/i],
  },
  {
    name: "Ed Weiss",
    slug: "ed-weiss",
    kind: "guest",
    role: "Beekeeper who taught Martha in her Westport catering days; appeared on MSL TV at the Turkey Hill hives.",
    aliases: [/\bEd\s+Weiss\b/i],
  },
  {
    name: "Norm Cote",
    slug: "norm-cote",
    kind: "guest",
    role: "Retired Norwalk firefighter and current keeper of Martha's beehives at Turkey Hill (and other Fairfield County clients).",
    aliases: [/\bNorm\s+Cote\b/i],
  },
  {
    name: "Jo Ubogy",
    slug: "jo-ubogy",
    kind: "guest",
    role: "Connecticut breeder of Himalayan cats; supplied Martha's six composer-named seal-point Himalayans — Mozart, Beethoven, Vivaldi, Verdi, Berlioz, and Bartók.",
    aliases: [/\bJo\s+Ubogy\b/i],
  },
  // ── Production crew (deep-research Round 1, 2026-05-27) ────────────────
  {
    name: "Isolde Motley",
    slug: "isolde-motley",
    kind: "contributor",
    role: "Founding Editor-in-Chief of Martha Stewart Living magazine (1990–1992); previously founding editor of This Old House magazine.",
    aliases: [/\bIsolde\s+Motley\b/i],
  },
  {
    name: "Susan Wyland",
    slug: "susan-wyland",
    kind: "contributor",
    role: "Editor-in-Chief of Martha Stewart Living magazine 1992–1996; went on to develop Real Simple at Time Inc.",
    aliases: [/\bSusan\s+Wyland\b/i],
  },
  {
    name: "Linda Corradina",
    slug: "linda-corradina",
    kind: "contributor",
    role: "Executive Producer of Martha Stewart Living Television.",
    aliases: [/\bLinda\s+Corradina\b/i],
  },
  {
    name: "Lauren Deen",
    slug: "lauren-deen",
    kind: "contributor",
    role: "Series Producer of Martha Stewart Living Television; three-time Daytime Emmy winner.",
    aliases: [/\bLauren\s+Deen\b/i],
  },
  {
    name: "Carolyn Kelly Wallach",
    slug: "carolyn-kelly-wallach",
    kind: "contributor",
    role: "MSL TV producer (1960–2004); four-time Daytime Emmy winner — the most-decorated producer on the show. Died at age 43 in Greenwich CT during the show's final months.",
    aliases: [/\bCarolyn\s+Kelly\s+Wallach\b/i],
  },
  {
    name: "Greta Anthony",
    slug: "greta-anthony",
    kind: "contributor",
    role: "First-ever culinary intern at Martha Stewart Living Omnimedia; later a James Beard Award winner.",
    aliases: [/\bGreta\s+Anthony\b/i],
  },
  {
    name: "Suzanne McGrath",
    slug: "suzanne-mcgrath",
    kind: "contributor",
    role: "Executive Producer of Martha Stewart Living Television.",
    aliases: [/\bSuzanne\s+McGrath\b/i],
  },
  {
    name: "Marcie McGoldrick",
    slug: "marcie-mcgoldrick",
    kind: "contributor",
    role: "Halloween + craft editor at Martha Stewart Living Omnimedia (joined 1999). Led plaster casting, paper-bag luminaries, and many of the show's signature Halloween projects.",
    aliases: [/\bMarcie\s+McGoldrick\b/i],
  },
  // ── Master Chefs (Round 3, 2026-05-27) — celebrity / chef guests ───────
  {
    name: "Nobu Matsuhisa",
    slug: "nobu-matsuhisa",
    kind: "chef",
    role: 'Japanese-Peruvian chef and founder of the Nobu and Matsuhisa restaurant empire (50+ locations globally). Appeared on MSL TV before he became a household name — MSL S9 E16 (~2002). "Nobu before Nobu."',
    aliases: [/\bNobu\s+Matsuhisa\b/i],
  },
  {
    name: "Julia Child",
    slug: "julia-child",
    kind: "chef",
    role: "Pioneering television chef (1912–2004); author of Mastering the Art of French Cooking. Guest on the 1995 Martha Stewart Christmas Special demonstrating croquembouche alongside Martha.",
    aliases: [/\bJulia\s+Child\b/i],
  },
  {
    name: "Jacques Pépin",
    slug: "jacques-pepin",
    kind: "chef",
    role: "Legendary French-American chef, author, and TV host; longtime friend of Martha. Founder of the International Culinary Center; PBS series with Julia Child.",
    aliases: [/\bJacques\s+P[ée]pin\b/i],
  },
  {
    name: "Jeffrey Alford",
    slug: "jeffrey-alford",
    kind: "chef",
    role: "Cookbook author (with Naomi Duguid) of Hot Sour Salty Sweet, Flatbreads & Flavors, etc. — global street-food and grain cookbooks. MSL S9 multiple appearances.",
    aliases: [/\bJeffrey\s+Alford\b/i],
  },
  {
    name: "David Pasternack",
    slug: "david-pasternack",
    kind: "chef",
    role: "Chef-owner of Esca (NYC, with Mario Batali and Joe Bastianich); known for crudo and Italian seafood. MSL S9 E78.",
    aliases: [/\bDavid\s+Pasternack\b/i],
  },
  {
    name: "Michel Richard",
    slug: "michel-richard",
    kind: "chef",
    role: "French-American chef-pastry chef (1948–2016); founded Citrus (LA), Citronelle (DC), Central. Master Chef of Pastry. MSL S9 E79.",
    aliases: [/\bMichel\s+Richard\b/i],
  },
  // ── Celebrities + cultural figures (Round 3) ─────────────────────────
  {
    name: "Michael Pollan",
    slug: "michael-pollan",
    kind: "guest",
    role: "Food and nature writer; author of The Omnivore's Dilemma, In Defense of Food, The Botany of Desire. Featured on MSL S9 E57 cider segment, pre-fame.",
    aliases: [/\bMichael\s+Pollan\b/i],
  },
  {
    name: "Dale Chihuly",
    slug: "dale-chihuly",
    kind: "guest",
    role: "Glass artist; founder of Pilchuck Glass School. Studio glass pioneer. MSL S9 E59.",
    aliases: [/\bDale\s+Chihuly\b/i],
  },
  {
    name: "Lorraine Bracco",
    slug: "lorraine-bracco",
    kind: "guest",
    role: "Actress known for The Sopranos (Dr. Melfi) and Goodfellas. MSL S9 E92.",
    aliases: [/\bLorraine\s+Bracco\b/i],
  },
  {
    name: "Ismail Merchant",
    slug: "ismail-merchant",
    kind: "guest",
    role: "Film producer of Merchant Ivory Productions (1936–2005); demonstrated Indian cooking on MSL S4 E9 (multipart Indian Food segment).",
    aliases: [/\bIsmail\s+Merchant\b/i],
  },
  {
    name: "Damien Hirst",
    slug: "damien-hirst",
    kind: "guest",
    role: "British contemporary artist (YBA generation). Artworks featured on MSL S9 E48/E52.",
    aliases: [/\bDamien\s+Hirst\b/i],
  },
  {
    name: "John Pawson",
    slug: "john-pawson",
    kind: "guest",
    role: "British minimalist architect. MSL S9 E76.",
    aliases: [/\bJohn\s+Pawson\b/i],
  },
  {
    name: "Walter Wick",
    slug: "walter-wick",
    kind: "guest",
    role: "Photographer; creator/illustrator of the I Spy children's-book series with Jean Marzollo. MSL S9 E75.",
    aliases: [/\bWalter\s+Wick\b/i],
  },
  {
    name: "Melanie Falick",
    slug: "melanie-falick",
    kind: "guest",
    role: "Knitting and craft author (Knitting in America; Handknit Holidays; later editorial director of STC Craft / Melanie Falick Books). MSL S9 E73.",
    aliases: [/\bMelanie\s+Falick\b/i],
  },
  {
    name: "Miss Piggy",
    slug: "miss-piggy",
    kind: "guest",
    role: "Muppet character (Jim Henson). Made gingerbread house with Martha and Ben Krupinski on the 1995 Christmas Special.",
    aliases: [/\bMiss\s+Piggy\b/i],
  },
  {
    name: "Hillary Clinton",
    slug: "hillary-clinton",
    kind: "guest",
    role: "First Lady of the United States 1993–2001; later Senator, Secretary of State, presidential nominee. Demonstrated a 50-state oak-leaf wreath at the White House on the 1995 Christmas Special.",
    aliases: [/\bHillary\s+(?:Rodham\s+)?Clinton\b/i],
  },
  {
    name: "Ben Krupinski",
    slug: "ben-krupinski",
    kind: "guest",
    role: "Hamptons-based luxury builder (1942–2018); built Martha's Lily Pond Lane renovations and many other Hamptons estates. Made gingerbread house with Martha and Miss Piggy on the 1995 Christmas Special.",
    aliases: [/\bBen\s+Krupinski\b/i],
  },
  {
    name: "Johnny Batson",
    slug: "johnny-batson",
    kind: "guest",
    role: "Poultry judge; co-judged the Central Pennsylvania Avian Club's 21st Annual Spring Show alongside Martha on May 3–4, 1997.",
    aliases: [/\bJohnny\s+Batson\b/i],
  },
];

// Higher-precision multi-word names extracted from the data. These are not required to be
// recurring — single mentions get one episode credit.
const ONE_OFF_NAME_REGEX = [
  // chef titles
  { regex: /\bChef\s+([A-Z][a-z]+(?:\s+[A-Z][a-z'\-]+){1,3})\b/g, kind: "chef" },
  // generic full names after "with"
  { regex: /\bwith\s+([A-Z][a-z]+\s+[A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+)?)\b/g, kind: "guest" },
  // Dr., Mr., Mrs.
  { regex: /\b(?:Dr|Mr|Ms|Mrs)\.\s+([A-Z][a-z'\-]+(?:\s+[A-Z][a-z'\-]+){0,2})\b/g, kind: "guest" },
];

// Names to never credit (junk caught by regex)
const NAME_STOP = new Set([
  "MS", "GT", "Pt", "Pts", "Part", "Parts", "Episode", "Season",
  "Lobster Club", "Marble House", "Christmas Dinner", "Vegetable Garden",
  "Spring Garden", "Cutting Garden", "Shade Garden",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Places & businesses
// ─────────────────────────────────────────────────────────────────────────────
const PLACE_SUFFIXES = [
  "Hatchery", "Farm", "Farms", "Bakery", "Galleries", "Gallery", "Museum",
  "Nursery", "Nurseries", "Orchard", "Orchards", "Vineyards", "Vineyard",
  "Studio", "Studios", "Cooperative", "Market", "Markets", "Brewery",
  "Distillery", "Restaurant", "Diner", "Forge", "Mill",
  "Trust", "Conservatory", "Foundry", "Atelier", "Greenhouse",
  "Cafe", "Café", "Zoo", "Pond", "Mansion",
  "Pottery", "Ceramics", "Bookseller", "Booksellers", "Antiques",
  "Hardware", "Stables", "Ranch", "Inn",
  "Cellars", "Wines", "Auctions",
];
const PLACE_SUFFIX_RE = new RegExp(
  `\\b([A-Z][A-Za-z'&\\.\\-]+(?:\\s+(?:de\\s+|of\\s+|the\\s+|at\\s+|&\\s+|and\\s+|[A-Z][A-Za-z'\\-&\\.]+))*\\s+(?:${PLACE_SUFFIXES.join("|")}))\\b`,
  "g"
);

// Known explicit places (curated)
const CURATED_PLACES = [
  { name: "Turkey Hill", slug: "turkey-hill", kind: "residence",
    role: "Martha's farmhouse in Westport, Connecticut (1971-2007). Home base for many MSL TV segments — gardens, kitchen, chickens, potting shed.",
    aliases: [/\bTurkey\s+Hill\b/i] },
  { name: "Westport, Connecticut", slug: "westport-ct", kind: "location",
    role: "Westport, CT — site of Turkey Hill, Martha's longtime home.",
    aliases: [/\bWestport\b/i] },
  { name: "Bedford, New York", slug: "bedford-ny", kind: "location",
    role: "Bedford, NY — Cantitoe Corners, Martha's later estate (acquired 2000).",
    aliases: [/\bBedford\b/i, /\bCantitoe\b/i] },
  { name: "East Hampton", slug: "east-hampton", kind: "location",
    role: "East Hampton, NY — Lily Pond Lane house featured in Christmas and summer specials.",
    aliases: [/\bEast\s+Hampton\b/i, /\bLily\s+Pond\b/i] },
  { name: "Skylands", slug: "skylands", kind: "residence",
    role: "Skylands — Martha's Maine summer house (Edsel Ford's former estate on Mount Desert Island, Seal Harbor).",
    aliases: [/\bSkylands\b/i] },
  { name: "Bronson Road", slug: "bronson-road", kind: "location",
    role: "Bronson Road, Fairfield County, CT — featured in multi-part garden and home segments.",
    aliases: [/\bBronson\s+Road\b/i] },
  { name: "Murray McMurray Hatchery", slug: "murray-mcmurray-hatchery", kind: "business",
    role: "Murray McMurray Hatchery, Webster City, Iowa — world's largest rare-breed poultry hatchery; visited in MSL Season 6.",
    aliases: [/\bMurray\s+McMurray\b/i] },
  { name: "Balthazar Bakery", slug: "balthazar-bakery", kind: "business",
    role: "Balthazar Bakery, NYC — Keith McNally's French bistro and bakery in SoHo.",
    aliases: [/\bBalthazar\b/i] },
  { name: "Mashantucket Pequot Museum", slug: "mashantucket-pequot-museum", kind: "museum",
    role: "Mashantucket Pequot Museum & Research Center, CT — Native American history museum.",
    aliases: [/\bMashantucket\s+Pequot\b/i] },
  { name: "Wave Hill", slug: "wave-hill", kind: "garden",
    role: "Wave Hill, Bronx, NY — 28-acre public garden and cultural center overlooking the Hudson.",
    aliases: [/\bWave\s+Hill\b/i] },
  { name: "Metropolitan Museum of Art", slug: "metropolitan-museum-of-art", kind: "museum",
    role: "Metropolitan Museum of Art, NYC — featured exhibits (e.g. Vermeer) visited as field trips.",
    aliases: [/\bMetropolitan\s+Museum\b/i] },
  { name: "Bronx Zoo", slug: "bronx-zoo", kind: "zoo",
    role: "Bronx Zoo, NYC — Deck the Zoo segment, Making Vines segment.",
    aliases: [/\bBronx\s+Zoo\b/i] },
  { name: "William Doyle Galleries", slug: "william-doyle-galleries", kind: "business",
    role: "William Doyle Galleries, NYC — auction house featured in MSL Season 6.",
    aliases: [/\bWilliam\s+Doyle\s+Galleries\b/i] },
  { name: "Shelburne Museum", slug: "shelburne-museum", kind: "museum",
    role: "Shelburne Museum, Vermont — folk-art and Americana museum.",
    aliases: [/\bShelburne\s+Museum\b/i] },
  { name: "Peckerwood Gardens", slug: "peckerwood-gardens", kind: "garden",
    role: "Peckerwood Garden, Hempstead, Texas — designer John Fairey's experimental botanic garden.",
    aliases: [/\bPeckerwood\b/i] },
  { name: "Yucca Do Nursery", slug: "yucca-do-nursery", kind: "business",
    role: "Yucca Do Nursery, Texas — specialty plant nursery linked with Peckerwood Garden.",
    aliases: [/\bYucca\s*Do\b/i] },
  { name: "Gilberties Herb Farm", slug: "gilberties-herb-farm", kind: "business",
    role: "Gilberties Herb Gardens, Easton, CT — organic herb farm.",
    aliases: [/\bGilbertie/i] },
  { name: "White Flower Farm", slug: "white-flower-farm", kind: "business",
    role: "White Flower Farm, Litchfield, CT — mail-order nursery.",
    aliases: [/\bWhite\s+Flower\s+Farm\b/i] },
  { name: "Durling's Citrus Farm", slug: "durlings-citrus-farm", kind: "business",
    role: "Durling's Citrus Farm — featured in citrus segment.",
    aliases: [/\bDurling/i] },
  { name: "Iggy's Bakery", slug: "iggys-bakery", kind: "business",
    role: "Iggy's Bread of the World, Cambridge MA — artisan bakery.",
    aliases: [/\bIggy'?s\s+Bakery\b/i] },
  { name: "Cupcake Cafe", slug: "cupcake-cafe", kind: "business",
    role: "Cupcake Cafe, NYC — known for floral buttercream cakes.",
    aliases: [/\bCupcake\s+Caf[eé]\b/i] },
  { name: "Costello Studio", slug: "costello-studio", kind: "business",
    role: "Costello Studio — leather-tooling craft segment.",
    aliases: [/\bCostello\s+Studio\b/i] },
  { name: "Dreesen's Donuts", slug: "dreesens-donuts", kind: "business",
    role: "Dreesen's, East Hampton — famous cake-doughnut maker.",
    aliases: [/\bDreesen/i] },
  { name: "Glen Horowitz Bookseller", slug: "glen-horowitz-bookseller", kind: "business",
    role: "Glenn Horowitz Bookseller — rare-books dealer (East Hampton/NYC).",
    aliases: [/\bGlen+\s*Horowitz\b/i] },
  { name: "Elias' Corner", slug: "elias-corner", kind: "business",
    role: "Elias' Corner, Astoria Queens — Greek seafood restaurant; 'Pit Stop' field trip.",
    aliases: [/\bElias'?\s+Corner\b/i] },
  { name: "New York Tree Trust", slug: "new-york-tree-trust", kind: "organization",
    role: "New York Tree Trust — public-tree stewardship program.",
    aliases: [/\bNew\s+York\s+Tree\s+Trust\b/i] },
  { name: "Marble House", slug: "marble-house", kind: "museum",
    role: "Marble House, Newport RI — Vanderbilt cottage (Preservation Society).",
    aliases: [/\bMarble\s+House\b/i] },
  { name: "Hog Island Oyster Farm", slug: "hog-island-oyster-farm", kind: "business",
    role: "Hog Island Oyster Co., Tomales Bay California — featured in oyster-farming field trip.",
    aliases: [/\bHog\s+Island\s+Oyster\b/i] },
  { name: "Center Art Studio", slug: "center-art-studio", kind: "business",
    role: "Center Art Studio, NYC — restoration studio for ceramics, glass, and decorative arts.",
    aliases: [/\bCenter\s+Art\s+Studio\b/i] },
  { name: "Columbine Ranch", slug: "columbine-ranch", kind: "farm",
    role: "Columbine Ranch — Western field-trip destination featured in MSL.",
    aliases: [/\bColumbine\s+Ranch\b/i] },
  { name: "Westminster Dog Show", slug: "westminster-dog-show", kind: "event",
    role: "Westminster Kennel Club Dog Show, Madison Square Garden NYC — annual field-trip subject.",
    aliases: [/\bWestminster\s+Dog\s+Show\b/i, /\bWestminster\s+Kennel\b/i] },
  { name: "Mount Desert Island", slug: "mount-desert-island", kind: "location",
    role: "Mount Desert Island, Maine — home to Acadia National Park and Skylands.",
    aliases: [/\bMount\s+Desert\b/i, /\bAcadia\b/i, /\bSeal\s+Harbor\b/i] },
  { name: "Frances Palmer Pottery", slug: "frances-palmer-pottery", kind: "business",
    role: "Frances Palmer Pottery, Weston Connecticut — hand-thrown earthenware studio.",
    aliases: [/\bFrances\s+Palmer\s+Pottery\b/i] },
  { name: "Guy Wolff Pottery", slug: "guy-wolff-pottery", kind: "business",
    role: "Guy Wolff Pottery, Bantam CT — English-style hand-thrown flower pots.",
    aliases: [/\bGuy\s+Wolff\s+Pottery\b/i] },
  { name: "Jonathan Adler Pottery", slug: "jonathan-adler-pottery", kind: "business",
    role: "Jonathan Adler's pottery studio (early career segment before the home-goods empire).",
    aliases: [/\bJonathan\s+Adler\s+Pottery\b/i] },
  { name: "Russian Tea Room", slug: "russian-tea-room", kind: "business",
    role: "The Russian Tea Room, 150 W 57th Street NYC — Imperial-Russian café next to Carnegie Hall.",
    aliases: [/\bRussian\s+Tea\s+Room\b/i] },
  { name: "Best Cellars", slug: "best-cellars", kind: "business",
    role: "Best Cellars, NYC — wine shop organized by taste profile (Fizzy/Fresh/Soft/Luscious/Big/Sweet) rather than region.",
    aliases: [/\bBest\s+Cellars\b/i] },
  { name: "Nanz Custom Hardware", slug: "nanz-custom-hardware", kind: "business",
    role: "Nanz, NYC — custom architectural hardware (door knobs, hinges, latches) for high-end residential and historic restorations.",
    aliases: [/\bNanz\b/i] },
  { name: "Kate Spade", slug: "kate-spade", kind: "business",
    role: "Kate Spade — handbags and lifestyle brand featured on a Madison Avenue field trip.",
    aliases: [/\bKate\s+Spade\b/i] },
  { name: "Atlantic Blanket Company", slug: "atlantic-blanket-company", kind: "business",
    role: "Atlantic Blanket Company, Maine — wool-blanket maker, three-Bayard-Bedstead segment.",
    aliases: [/\bAtlantic\s+Blanket\b/i] },
  { name: "Wildwood Stables", slug: "wildwood-stables", kind: "business",
    role: "Wildwood Stables — equestrian field-trip destination.",
    aliases: [/\bWildwood\s+Stables\b/i] },
  { name: "Bard Center", slug: "bard-center", kind: "museum",
    role: "Bard Graduate Center, NYC — decorative-arts research and exhibitions (E.W. Godwin field trip).",
    aliases: [/\bBard\s+Center\b/i, /\bBard\s+Graduate/i] },
  { name: "Seventh Regiment Antiques", slug: "seventh-regiment-antiques", kind: "event",
    role: "Seventh Regiment Armory Antiques Show, Park Avenue NYC — annual fine-antiques fair.",
    aliases: [/\bSeventh\s+Regiment\b/i] },
  { name: "Maine Antiques Digest", slug: "maine-antiques-digest", kind: "organization",
    role: "Maine Antiques Digest — long-running trade publication for antiques dealers and collectors.",
    aliases: [/\bMaine\s+Antiques\s+Digest\b/i] },
  // Restaurants tied to Master Chefs guests
  { name: "Balthazar Restaurant", slug: "balthazar-restaurant", kind: "business",
    role: "Balthazar (80 Spring Street, SoHo NYC) — Keith McNally's French brasserie, opened 1997. Riad Nasr and Lee Hanson were co-chefs in the early 2000s. MSL S5 E146V \"Balthazar Restaurant: Brandade de Morue, Braised Ribs.\"",
    aliases: [/\bBalthazar\s+Restaurant\b/i] },
  { name: "Frenchette", slug: "frenchette", kind: "business",
    role: "Frenchette (TriBeCa NYC) — Riad Nasr & Lee Hanson's own restaurant after Balthazar. Cookbook Frenchette Bistro Cooking (2024).",
    aliases: [/\bFrenchette\b/i] },
  { name: "Le Bernardin", slug: "le-bernardin", kind: "business",
    role: "Le Bernardin (NYC) — Eric Ripert's three-Michelin-star French seafood restaurant. The Le Bernardin Cookbook (1998).",
    aliases: [/\bLe\s+Bernardin\b/i] },
  { name: "Frontera Grill", slug: "frontera-grill", kind: "business",
    role: "Frontera Grill / Topolobampo (Chicago) — Rick Bayless's regional Mexican restaurants.",
    aliases: [/\bFrontera\s+Grill\b/i, /\bTopolobampo\b/i] },
  { name: "Picholine", slug: "picholine", kind: "business",
    role: "Picholine (NYC, opened 1993 by Terrance Brennan; named after the green olive). Mediterranean/French. Closed 2015.",
    aliases: [/\bPicholine\b/i] },
  { name: "Union Square Cafe", slug: "union-square-cafe", kind: "business",
    role: "Union Square Cafe (NYC) — Danny Meyer's first restaurant (opened 1985). Michael Romano was executive chef from 1988. Their famous Caesar salad featured on MSL TV.",
    aliases: [/\bUnion\s+Square\s+Cafe\b/i] },
  { name: "Watershed", slug: "watershed-restaurant", kind: "business",
    role: "Watershed (Decatur GA) — Scott Peacock's Southern restaurant. Edna Lewis was the elder co-creator.",
    aliases: [/\bWatershed\b/i] },
  { name: "Rosa Mexicano", slug: "rosa-mexicano", kind: "business",
    role: "Rosa Mexicano (NYC, est. 1984 by Josefina Howard) — first restaurant to elevate Mexican cuisine in NYC. Famous for tableside guacamole and pomegranate margaritas.",
    aliases: [/\bRosa\s+Mexicano\b/i] },
  { name: "Le Cirque", slug: "le-cirque", kind: "business",
    role: "Le Cirque (NYC, Sirio Maccioni). Egidiana \"Egi\" Maccioni is the consulting chef. Osteria del Circo is its Tuscan sibling.",
    aliases: [/\bLe\s+Cirque\b/i, /\bOsteria\s+del\s+Circo\b/i] },
  { name: "Daniel", slug: "daniel-restaurant", kind: "business",
    role: "Daniel (NYC) — Daniel Boulud's flagship French restaurant on East 65th St.",
    aliases: [/\bRestaurant\s+Daniel\b/i, /\bDaniel\s+NYC\b/i] },
  { name: "Russ & Daughters", slug: "russ-and-daughters", kind: "business",
    role: "Russ & Daughters (179 E Houston St, Lower East Side NYC, est. 1914) — Jewish appetizing store, third-generation under Mark Russ Federman during MSL TV era. Smoked fish, caviar, bagels.",
    aliases: [/\bRuss\s+(?:and|&)\s+Daughters\b/i] },
  { name: "Eli Wilner & Co.", slug: "eli-wilner-and-co", kind: "business",
    role: "Eli Wilner & Company (NYC) — antique-frame restorer and dealer; framed pieces for many of Martha's homes.",
    aliases: [/\bEli\s+Wilner\b/i] },
  { name: "Olives", slug: "olives-restaurant", kind: "business",
    role: "Olives (Charlestown MA, later NYC and elsewhere) — Todd English's Mediterranean restaurant. Figs is its sibling pizza concept.",
    aliases: [/\bOlives\s+Restaurant\b/i, /\bTodd\s+English'?s\s+Olives\b/i] },
  { name: "La Varenne", slug: "la-varenne", kind: "business",
    role: "École de Cuisine La Varenne — Anne Willan's French cooking school (originally Paris, later Burgundy).",
    aliases: [/\bLa\s+Varenne\b/i] },
  { name: "Beppe", slug: "beppe-restaurant", kind: "business",
    role: "Beppe (NYC) — Cesare Casella's Tuscan restaurant (opened 2001).",
    aliases: [/\bBeppe\b/i] },
  { name: "Parrots of the World", slug: "parrots-of-the-world", kind: "business",
    role: "Parrots of the World (Rockville Centre, NY) — Marc Morrone's pet shop, co-founded 1978 with Nick Guerra. Set of Petkeeping with Marc Morrone (2003–2006); also the source of many MSL TV petkeeping segments.",
    aliases: [/\bParrots\s+of\s+the\s+World\b/i],
    collections: ["petkeeping-with-marc-morrone", "petkeeping-1"] },
  { name: "Swans Island Company", slug: "swans-island-company", kind: "business",
    role: "Swans Island Company (Northport, Maine, originally Swans Island) — handwoven natural-dyed wool blankets. Featured on MSL TV; sometimes misremembered as \"Atlantic Blanket Company\".",
    aliases: [/\bSwan'?s?\s+Island\s+(?:Company|Blanket)\b/i] },
  { name: "Westport, Connecticut", slug: "westport-connecticut", kind: "location",
    role: "Westport, Fairfield County, CT — site of Turkey Hill (Martha's home 1971–2007) and base of her catering business that preceded the magazine and TV show.",
    aliases: [/\bWestport,?\s+(?:CT|Connecticut)\b/i] },
  { name: "Greens Farms", slug: "greens-farms", kind: "location",
    role: "Greens Farms neighborhood of Westport, CT — where Turkey Hill stood. Pre-1648 settlement; later given its name from the local Green family.",
    aliases: [/\bGreens\s+Farms\b/i] },
  { name: "Katonah / Bedford", slug: "katonah-bedford", kind: "location",
    role: "Katonah / Bedford, NY — site of Cantitoe Corners, Martha's 153-acre farm. Formerly Sycamore Farms (settled 1784).",
    aliases: [/\bKatonah\b/i, /\bCantitoe\b/i] },
  { name: "Seal Harbor, Maine", slug: "seal-harbor-maine", kind: "location",
    role: "Seal Harbor, Mount Desert Island, Maine — site of Skylands, Martha's summer house (built 1923–1925 by architect Duncan Candler for Edsel and Eleanor Ford; landscape by Jens Jensen).",
    aliases: [/\bSeal\s+Harbor\b/i] },
  // ── Round 1 + Round 3 new businesses (2026-05-27) ────────────────────
  { name: "Cabot Hosiery Mills", slug: "cabot-hosiery-mills", kind: "business",
    role: "Cabot Hosiery Mills, Northfield VT (founded 1978 by Marc Cabot) — Vermont sock manufacturer; later launched the Darn Tough brand in 2004. During MSL TV era was a B2B private-label maker.",
    aliases: [/\bCabot\s+Hosiery\b/i] },
  { name: "Brewery Ommegang", slug: "brewery-ommegang", kind: "business",
    role: "Brewery Ommegang, Cooperstown NY (founded 1997 by Don Feinberg and Wendy Littlefield) — Belgian-style brewery; sold to Duvel Moortgat in 2003.",
    aliases: [/\bBrewery\s+Ommegang\b/i, /\bOmmegang\b/i] },
  { name: "Straus Family Creamery", slug: "straus-family-creamery", kind: "business",
    role: "Straus Family Creamery, Marshall CA (founded 1941, became first certified-organic creamery west of the Mississippi in 1994). Note spelling: \"Straus\" not \"Strauss\". MSL TV multi-part field trip.",
    aliases: [/\bStrau?s+\s+(?:Family\s+)?(?:Creamery|Dairy)\b/i] },
  { name: "Saint Basil Seminary", slug: "saint-basil-seminary", kind: "business",
    role: "Saint Basil Seminary, Stamford CT (founded 1933) — Ukrainian Catholic seminary; home of the Ukrainian Museum + Library that supplied the Ukrainian Easter Bread / Pysanky segment (MSL S6 E305V).",
    aliases: [/\bSaint\s+Basil\b/i, /\bSt\.\s*Basil\s+Seminary\b/i] },
  { name: "Vanns Spices", slug: "vanns-spices", kind: "business",
    role: "Vanns Spices, Baltimore MD (founded 1981 by Virginia Limansky and Ann Wilder). Featured on MSL S8 E153V.",
    aliases: [/\bVanns?\s+Spices\b/i] },
  { name: "JustUs Frenchies", slug: "justus-frenchies", kind: "business",
    role: "JustUs Dogs / JustUs Frenchies (Trappe MD; Suzanne Orban-Stagle + Ronald Readmond) — the French Bulldog breeder where Martha got Francesca and Sharkey.",
    aliases: [/\bJustUs\s+(?:Dogs|Frenchies)\b/i] },
  { name: "Central Pennsylvania Avian Club", slug: "central-pennsylvania-avian-club", kind: "organization",
    role: "Central Pennsylvania Avian Club (CPAC), Bloomsburg PA (founded 1974) — bird/canary breeders association. Martha was celebrity judge at their 21st Annual Spring Show, May 3–4 1997, with poultry judge Johnny Batson. Episode aired Sept 18 1997 (MSL S5 E10). The mysterious \"Avian Club PT.1 / PT.2 / PT.3\" segments.",
    aliases: [/\bAvian\s+Club\b/i, /\bCentral\s+Pennsylvania\s+Avian\b/i] },
  { name: "Hyman Hendler & Sons", slug: "hyman-hendler-and-sons", kind: "business",
    role: "Hyman Hendler & Sons (NYC, founded 1900s) — Garment District ribbon merchant favored by designers and crafters; closed 2014. MSL S4 E20.",
    aliases: [/\bHyman\s+Hendler\b/i] },
  { name: "City Bakery", slug: "city-bakery-nyc", kind: "business",
    role: "City Bakery, NYC (founded 1990 by Maury Rubin) — pretzel croissants and the famous hot chocolate festival. MSL S2 E24 field trip.",
    aliases: [/\bCity\s+Bakery\b/i] },
  { name: "Tavern on the Green", slug: "tavern-on-the-green", kind: "business",
    role: "Tavern on the Green, Central Park NYC — Christmas field trip on MSL S3 E15.",
    aliases: [/\bTavern\s+on\s+the\s+Green\b/i] },
  { name: "The River Café", slug: "river-cafe-brooklyn", kind: "business",
    role: "The River Café, DUMBO Brooklyn — under the Brooklyn Bridge on a barge; opened 1977 by Buzzy O'Keeffe. MSL S4 E5.",
    aliases: [/\bRiver\s+Caf[eé]\b/i] },
  { name: "New York Botanical Garden", slug: "new-york-botanical-garden", kind: "garden",
    role: "New York Botanical Garden (Bronx, founded 1891) — Holiday Train Show field trip on MSL S2 E14.",
    aliases: [/\bNew\s+York\s+Botanical\s+Garden\b/i, /\bNYBG\b/, /\bHoliday\s+Train\s+Show\b/i] },
  { name: "Mount Vernon", slug: "mount-vernon", kind: "museum",
    role: "Mount Vernon, VA — George Washington's plantation and museum. MSL S9 E61 field trip.",
    aliases: [/\bMount\s+Vernon\b/i] },
  { name: "Scott Arboretum", slug: "scott-arboretum", kind: "garden",
    role: "Scott Arboretum at Swarthmore College, PA — public garden across the college campus. MSL S9 E96.",
    aliases: [/\bScott\s+Arboretum\b/i] },
  // Restaurants tied to Round 3 chefs
  { name: "Esca", slug: "esca", kind: "business",
    role: "Esca, NYC (opened 2000; closed 2024) — David Pasternack's Italian seafood restaurant with Mario Batali and Joe Bastianich; known for crudo.",
    aliases: [/\bEsca\b/i] },
  { name: "Citronelle", slug: "citronelle", kind: "business",
    role: "Citronelle, Washington DC (opened 1993; closed 2012) — Michel Richard's flagship.",
    aliases: [/\bCitronelle\b/i] },
  { name: "Matsuhisa", slug: "matsuhisa", kind: "business",
    role: "Matsuhisa, Beverly Hills (opened 1987) — Nobu Matsuhisa's original restaurant before the Nobu chain.",
    aliases: [/\bMatsuhisa\s+Beverly\b/i] },
  { name: "Lionel Trains", slug: "lionel-trains", kind: "business",
    role: "Lionel LLC — American toy-train manufacturer (founded 1900); MSL TV factory field trip.",
    aliases: [/\bLionel\s+(?:Trains|Train)\b/i] },
  { name: "Yale Alley Cats", slug: "yale-alley-cats", kind: "organization",
    role: "Yale Alley Cats — a cappella group from Yale University; repeat MSL TV guests including \"Singing with Yale Alley Kats with MS\" segments.",
    aliases: [/\bYale\s+Alley\b/i] },
];

// Place names we should never credit (false positives from regex)
const PLACE_STOP = new Set([
  "Annual Garden", "Basic Herb Garden", "Brooklyn Rose Garden", "Container Garden",
  "Cutting Garden", "FT - Garden", "Folly Garden", "Garden", "Japanese Stroll Garden",
  "Large Garden", "Making New Herb Garden", "Making a Garden", "Midsummer Vegetable Garden",
  "Mulch Garden", "Online Garden", "Repair Garden", "Rose Garden", "Shade Garden",
  "Sharpening & Cleaning Garden", "Spring Cleaning Garden", "Spring Garden",
  "Spring Vegetable Garden", "Vegetable Garden", "FT - Old Mill", "Flat Tire on Garden",
  "Avian Club", "Exotic Breed - House", "Alpine House", "Westport House",
  "Christmas East Hampton House", "Organize Every Room of Your House",
  // suffix-regex false positives (cooking topics, segment names)
  "Antique Linens", "Garden Antiques", "Demystifying Antiques", "Tasting Thanksgiving Wines",
  "Summer Wines", "Pet Food", "Lustre Pottery", "Repairing Ceramics", "Cleaning Ceramics",
  "Collecting Lustre Pottery", "Maine Antiques", "Dog Painting Auction",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Manual episode→entity credits — for chefs/guests whose name doesn't appear in
// the vhx description but whose identity is confirmed by dish/restaurant context
// in research. Each entry attributes a specific vhx episode to an entity slug.
// Sources: see wiki/topics/martha-stewart-living-tv/raw/articles/.
// ─────────────────────────────────────────────────────────────────────────────
const MANUAL_CREDITS = [
  // Riad Nasr (Balthazar / Frenchette)
  { vhx_id_match: /Brandade\s+de\s+Morue/i, slug: "riad-nasr", context: "Balthazar — Brandade de Morue, Braised Ribs" },
  { vhx_id_match: /Brandade\s+de\s+Morue/i, slug: "balthazar-restaurant", context: "Balthazar — Brandade de Morue, Braised Ribs" },
  // Patricia Wells (Pistou Soup, Herbes de Provence)
  { vhx_id_match: /Pistou\s+Soup/i, slug: "patricia-wells", context: "Pistou Soup, Basic Bread Dough, Herbes de Provence, Lavender Sachet" },
  // Terrance Brennan (Picholine — Sea Bass with Rhubarb)
  { vhx_id_match: /Picholine\s+Olives|Sea\s+Bass\s+with\s+Rhubarb\s+Compote/i, slug: "terrance-brennan", context: "Picholine — Sea Bass with Rhubarb Compote / Panna Cotta / Picholine Olives" },
  { vhx_id_match: /Picholine\s+Olives|Sea\s+Bass\s+with\s+Rhubarb\s+Compote/i, slug: "picholine", context: "Picholine — Sea Bass with Rhubarb Compote / Panna Cotta / Picholine Olives" },
  // Scott Peacock (Crispy Crunchy Fried Chicken, with Edna Lewis lineage)
  { vhx_id_match: /Crispy\s+Crunchy\s+Fried\s+Chicken/i, slug: "scott-peacock", context: "Southern Pan-Fried / Crispy Crunchy Fried Chicken segment" },
  { vhx_id_match: /Crispy\s+Crunchy\s+Fried\s+Chicken/i, slug: "watershed-restaurant", context: "Watershed (Decatur GA) — Scott Peacock + Edna Lewis" },
  // Cesare Casella (Tuscan Pici Pasta / Penne Alla Telefano)
  { vhx_id_match: /Tuscan\s+Pi[cz]i\s+Pasta|Penne\s+Alla\s+Telefano/i, slug: "cesare-casella", context: "Tuscan Pici Pasta; Calf's Liver with Bacon and Capers" },
  { vhx_id_match: /Tuscan\s+Pi[cz]i\s+Pasta|Penne\s+Alla\s+Telefano/i, slug: "beppe-restaurant", context: "Beppe (NYC) — Cesare Casella's Tuscan" },
  // Daniel Boulud (Cod Cockles & Chorizo Basquaise, Salmon with Sorrel, Chateaubriand)
  { vhx_id_match: /Cod\s+Cockles|Chorizo\s+Basquaise|Salmon\s+with\s+Sorrel|Chateaubriand/i, slug: "daniel-boulud", context: "Daniel Boulud signature dish" },
  { vhx_id_match: /Cod\s+Cockles|Chorizo\s+Basquaise|Salmon\s+with\s+Sorrel|Chateaubriand/i, slug: "daniel-restaurant", context: "Daniel (NYC)" },
  // Hiroko Shimbo (Making Dashi, Cooking with Miso)
  { vhx_id_match: /Making\s+Dashi|Cooking\s+with\s+Miso/i, slug: "hiroko-shimbo", context: "Cooking with Miso / Making Dashi / Perfect Rice" },
  // Eric Ripert (Le Bernardin)
  { vhx_id_match: /Le\s+Bernardin/i, slug: "eric-ripert", context: "Le Bernardin" },
  { vhx_id_match: /Le\s+Bernardin/i, slug: "le-bernardin", context: "Le Bernardin" },
  // Marco Polo Stufano (Wave Hill)
  { vhx_id_match: /Wave\s+Hill/i, slug: "marco-polo-stufano", context: "Wave Hill (Bronx) — Stufano founding director" },
  // John Fairey (Peckerwood)
  { vhx_id_match: /Peckerwood|Yucca\s*Do/i, slug: "john-fairey", context: "Peckerwood / Yucca Do — John Fairey" },
  // Marc Morrone's pet shop
  { vhx_id_match: /\bMarc\s+Morrone\b/i, slug: "parrots-of-the-world", context: "Parrots of the World — Marc Morrone's pet shop" },
  // Egi Maccioni / Le Cirque
  { vhx_id_match: /Meeting\s+Egi|with\s+Egi|Ciambella\s+Coffee\s+Cake|Tuscan\s+Baked\s+Tomatoes/i, slug: "egidiana-maccioni", context: "Egi Maccioni — Le Cirque" },
  { vhx_id_match: /Meeting\s+Egi|with\s+Egi|Ciambella\s+Coffee\s+Cake/i, slug: "le-cirque", context: "Le Cirque / Osteria del Circo" },
  // Michael Romano / Union Square Cafe
  { vhx_id_match: /Caesar\s+Salad|Spinach\s+Cannelloni|Interview\s+with\s+Michael/i, slug: "michael-romano", context: "Union Square Cafe — Michael Romano" },
  { vhx_id_match: /Caesar\s+Salad|Spinach\s+Cannelloni|Interview\s+with\s+Michael/i, slug: "union-square-cafe", context: "Union Square Cafe (NYC) — Michael Romano exec chef" },
  // Mark Russ Federman / Russ & Daughters
  { vhx_id_match: /Caviar\s+with\s+Mark|Caviar\s+Tasting/i, slug: "mark-russ-federman", context: "Russ & Daughters — Caviar with Mark" },
  { vhx_id_match: /Caviar\s+with\s+Mark|Caviar\s+Tasting/i, slug: "russ-and-daughters", context: "Russ & Daughters (NYC)" },
  // Eli Wilner ("Tag Sale Find - with Eli" — hyphen separator in real data)
  { vhx_id_match: /Tag\s+Sale\s+Find[\s\-]+with\s+Eli|with\s+Eli\b/i, slug: "eli-wilner", context: "Tag Sale Find — with Eli" },
  { vhx_id_match: /Tag\s+Sale\s+Find[\s\-]+with\s+Eli|with\s+Eli\b/i, slug: "eli-wilner-and-co", context: "Eli Wilner & Co." },
  // Gael Towey
  { vhx_id_match: /Origami\s+with\s+Gail/i, slug: "gael-towey", context: "Origami with Gail (Gael Towey)" },
  // Frances Palmer / Guy Wolff / Jonathan Adler — already match by name but credit the pottery business
  { vhx_id_match: /Frances\s+Palmer/i, slug: "frances-palmer-pottery", context: "Frances Palmer Pottery" },
  { vhx_id_match: /Guy\s+Wolff/i, slug: "guy-wolff-pottery", context: "Guy Wolff Pottery" },
  // Madhur Jaffrey (Indian segments)
  { vhx_id_match: /Basmati\s+Rice|Shrimp\s+in\s+Mustard\s+Seed|Indian\s+Meal\s+Payoff|Indian\s+Food/i, slug: "madhur-jaffrey", context: "Indian segments — Madhur Jaffrey" },
  // Round 3 (2026-05-27) — businesses confirmed in vhx data
  { vhx_id_match: /\bOmmegang\b/i, slug: "brewery-ommegang", context: "Brewery Ommegang field trip" },
  { vhx_id_match: /\bCabot\b/i, slug: "cabot-hosiery-mills", context: "Cabot Hosiery Mills field trip" },
  { vhx_id_match: /\bStrau?s\s+(?:Family\s+)?(?:Creamery|Dairy)\b/i, slug: "straus-family-creamery", context: "Straus Family Creamery (Marin County CA)" },
  { vhx_id_match: /\bVanns?\s+Spices\b/i, slug: "vanns-spices", context: "Vanns Spices (Baltimore)" },
  { vhx_id_match: /\bHyman\s+Hendler\b/i, slug: "hyman-hendler-and-sons", context: "Hyman Hendler & Sons ribbons" },
  { vhx_id_match: /\bCity\s+Bakery\b/i, slug: "city-bakery-nyc", context: "City Bakery NYC" },
  { vhx_id_match: /\bBotanical\s+Garden|\bHoliday\s+Train\s+Show/i, slug: "new-york-botanical-garden", context: "NYBG Holiday Train Show" },
  { vhx_id_match: /\bTavern\s+on\s+the\s+Green\b/i, slug: "tavern-on-the-green", context: "Tavern on the Green Christmas field trip" },
  { vhx_id_match: /\bRiver\s+Caf[eé]\b/i, slug: "river-cafe-brooklyn", context: "The River Café (DUMBO Brooklyn)" },
  { vhx_id_match: /\bSaint\s+Basil|\bSt\.\s*Basil\b/i, slug: "saint-basil-seminary", context: "Saint Basil Seminary (Ukrainian Easter Bread / Pysanky)" },
  { vhx_id_match: /\bAvian\s+Club\b/i, slug: "central-pennsylvania-avian-club", context: "Central Pennsylvania Avian Club (Bloomsburg PA, 1997)" },
  { vhx_id_match: /\bLionel\b/i, slug: "lionel-trains", context: "Lionel Train factory field trip" },
  { vhx_id_match: /\bYale\s+Alley\b/i, slug: "yale-alley-cats", context: "Yale Alley Cats a cappella group" },
  // Round 3 — Ismail Merchant (Indian Food in S4 E9)
  { vhx_id_match: /Indian\s+Food/i, slug: "ismail-merchant", context: "Indian Food multipart segment (Merchant Ivory's Ismail Merchant)" },
  // Round 3 — Avian Club judge
  { vhx_id_match: /\bAvian\s+Club\b/i, slug: "johnny-batson", context: "Co-judge with Martha at CPAC Spring Show 1997" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
const itemsByVhx = new Map();
const itemsJson = JSON.parse(await readFile(ITEMS_JSON, "utf8"));
for (const it of itemsJson) {
  if (!itemsByVhx.has(it.vhx_id)) itemsByVhx.set(it.vhx_id, []);
  itemsByVhx.get(it.vhx_id).push(it);
}

const files = await readdir(RAW_DIR);
const records = [];
for (const f of files) {
  const o = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  if (!o.id) continue;
  records.push(o);
}
console.log(`[entities] loaded ${records.length} vhx records, ${itemsByVhx.size} cross-referenced item records`);

const appearances = []; // { entity_slug, entity_kind, vhx_id, source, context }

function recordPerson(slug, vhxId, source, context) {
  appearances.push({ kind: "person", slug, vhx_id: vhxId, source, context: context.slice(0, 200) });
}
function recordPlace(slug, vhxId, source, context) {
  appearances.push({ kind: "place", slug, vhx_id: vhxId, source, context: context.slice(0, 200) });
}

// 1) collection-derived (people + places)
for (const p of PEOPLE) {
  if (!p.collections) continue;
  for (const slug of p.collections) {
    const items = itemsJson.filter((x) => x.collection_slug === slug);
    for (const it of items) {
      recordPerson(p.slug, it.vhx_id, `collection:${slug}`, it.title || "");
    }
  }
}
for (const p of CURATED_PLACES) {
  if (!p.collections) continue;
  for (const slug of p.collections) {
    const items = itemsJson.filter((x) => x.collection_slug === slug);
    for (const it of items) {
      recordPlace(p.slug, it.vhx_id, `collection:${slug}`, it.title || "");
    }
  }
}

// 2) curated allowlist regex match on description
for (const rec of records) {
  const desc = (rec.description || "") + "\n" + (rec.short_description || "");
  const title = rec.title || "";
  const text = desc + "\n" + title;
  for (const p of PEOPLE) {
    let matched = false;
    for (const alias of p.aliases || []) {
      const m = text.match(alias);
      if (m) {
        if (p.requires && !p.requires.some((r) => r.test(text))) continue;
        matched = true;
        break;
      }
    }
    if (matched) {
      // find the line that contains the match for context
      const lines = text.split(/\r?\n/);
      const matchLine = lines.find((l) => p.aliases.some((a) => a.test(l))) || "";
      recordPerson(p.slug, rec.id, "description-regex", matchLine);
    }
  }
}

// 3) (intentionally skipped) generic one-off "with X" regex was too noisy with ingredient/dish
//    false positives ("with Squash Blossoms", "with Coarse Salt"). Recurring contributors come
//    from the curated PEOPLE allowlist above; one-off guests can be added there explicitly.

// 4) curated places
for (const rec of records) {
  const desc = (rec.description || "") + "\n" + (rec.short_description || "") + "\n" + (rec.title || "");
  for (const p of CURATED_PLACES) {
    for (const alias of p.aliases || []) {
      if (alias.test(desc)) {
        const lines = desc.split(/\r?\n/);
        const matchLine = lines.find((l) => alias.test(l)) || "";
        recordPlace(p.slug, rec.id, "curated", matchLine);
        break;
      }
    }
  }
}

// 4b) manual credits — researched dish/restaurant patterns that attribute episodes
//     to chefs whose name doesn't actually appear in the description.
for (const rec of records) {
  const haystack = [rec.title || "", rec.description || "", rec.short_description || ""].join("\n");
  for (const credit of MANUAL_CREDITS) {
    if (!credit.vhx_id_match.test(haystack)) continue;
    appearances.push({
      kind: PEOPLE.some((p) => p.slug === credit.slug) ? "person" : "place",
      slug: credit.slug,
      vhx_id: rec.id,
      source: "manual-credit",
      context: credit.context,
    });
  }
}

// 5) generic place-suffix sweep (capture everything else like Bakery/Farm/Museum)
const discoveredPlaces = new Map(); // slug -> { name, kind, mentions }
for (const rec of records) {
  const desc = (rec.description || "") + "\n" + (rec.short_description || "");
  for (const m of desc.matchAll(PLACE_SUFFIX_RE)) {
    let name = m[1].trim();
    // Trim noise prefixes
    name = name.replace(/^(FT|Field\s*Trip)\s*[-:]\s*/i, "");
    name = name.replace(/^(FT-?)\s+/i, "");
    // Skip stopwords
    if (PLACE_STOP.has(name)) continue;
    if (name.length < 5 || name.length > 60) continue;
    // Skip generic ones (just the suffix alone)
    const words = name.split(/\s+/);
    if (words.length < 2) continue;
    const slug = slugify(name);
    // Skip ones already curated
    if (CURATED_PLACES.some((p) => p.slug === slug)) continue;
    const kind = inferPlaceKind(name);
    if (!discoveredPlaces.has(slug)) discoveredPlaces.set(slug, { name, kind, mentions: 0 });
    discoveredPlaces.get(slug).mentions++;
    recordPlace(slug, rec.id, "discovered-suffix", m[0]);
  }
}

// 6) Field-trip subject sweep — for FT entries that didn't match the suffix pattern,
// still capture them so users can browse field trips.
const fieldTripRe = /(?:FT\s*[-:]|Field\s*Trip\s*[-:]|^FT\s+)\s*([^|\r\n]+?)(?:\s+Pt\.|\s+Part\s+\d|\s*$)/gim;
const discoveredFieldTrips = new Map();
for (const rec of records) {
  const desc = rec.description || "";
  for (const m of desc.matchAll(fieldTripRe)) {
    let subj = m[1].trim();
    if (subj.length < 4 || subj.length > 70) continue;
    if (PLACE_STOP.has(subj)) continue;
    const slug = "ft-" + slugify(subj);
    // Skip if already a curated/discovered place
    if (CURATED_PLACES.some((p) => slugify(p.name) === slugify(subj))) continue;
    if (discoveredPlaces.has(slugify(subj))) continue;
    if (!discoveredFieldTrips.has(slug)) discoveredFieldTrips.set(slug, { name: subj, kind: "field-trip", mentions: 0 });
    discoveredFieldTrips.get(slug).mentions++;
    appearances.push({ kind: "place", slug, name: subj, source: "discovered-ft", vhx_id: rec.id, context: m[0] });
  }
}

// Build final entity rosters
const peopleOut = PEOPLE.map((p) => ({
  slug: p.slug, name: p.name, kind: p.kind, role: p.role,
}));

// Discovered one-off people — pull from appearances, dedupe by slug
const oneOffPeople = new Map();
for (const a of appearances) {
  if (a.kind !== "person" || a.source !== "discovered-regex") continue;
  if (!oneOffPeople.has(a.slug)) oneOffPeople.set(a.slug, { slug: a.slug, name: a.name, kind: a.person_kind, role: null, mentions: 0 });
  oneOffPeople.get(a.slug).mentions++;
}
for (const v of oneOffPeople.values()) {
  if (peopleOut.some((p) => p.slug === v.slug)) continue;
  peopleOut.push(v);
}

const placesOut = CURATED_PLACES.map((p) => ({
  slug: p.slug, name: p.name, kind: p.kind, role: p.role,
}));
for (const v of discoveredPlaces.values()) {
  placesOut.push({ slug: slugify(v.name), name: v.name, kind: v.kind, role: null, mentions: v.mentions });
}
for (const v of discoveredFieldTrips.values()) {
  placesOut.push({ slug: "ft-" + slugify(v.name), name: v.name, kind: v.kind, role: null, mentions: v.mentions });
}

const out = { people: peopleOut, places: placesOut, appearances };
await writeFile(OUT, JSON.stringify(out, null, 2));

// Summary
const personCounts = new Map();
const placeCounts = new Map();
for (const a of appearances) {
  const map = a.kind === "person" ? personCounts : placeCounts;
  map.set(a.slug, (map.get(a.slug) || 0) + 1);
}
console.log(`\n[entities] wrote ${OUT}`);
console.log(`  ${peopleOut.length} unique people`);
console.log(`  ${placesOut.length} unique places`);
console.log(`  ${appearances.length} total appearances`);
console.log(`\n[entities] top 20 people by appearances:`);
for (const [slug, n] of [...personCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const p = peopleOut.find((x) => x.slug === slug);
  console.log(`  ${String(n).padStart(4)}  ${p?.name ?? slug}`);
}
console.log(`\n[entities] top 20 places by appearances:`);
for (const [slug, n] of [...placeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const p = placesOut.find((x) => x.slug === slug);
  console.log(`  ${String(n).padStart(4)}  ${p?.name ?? slug} (${p?.kind ?? "?"})`);
}

// ─────────────────────────────────────────────────────────────────────────────
function slugify(s) {
  return s.toLowerCase()
    .replace(/[''`’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferPlaceKind(name) {
  if (/Hatchery/i.test(name)) return "business";
  if (/Bakery/i.test(name)) return "business";
  if (/Galleries|Gallery/i.test(name)) return "business";
  if (/Museum/i.test(name)) return "museum";
  if (/Garden|Gardens/i.test(name)) return "garden";
  if (/Park/i.test(name)) return "park";
  if (/Zoo/i.test(name)) return "zoo";
  if (/Farm|Farms|Nursery|Nurseries|Orchard|Vineyards?/i.test(name)) return "farm";
  if (/Conservatory/i.test(name)) return "garden";
  if (/Studio|Studios|Atelier|Forge|Foundry|Mill/i.test(name)) return "business";
  if (/Restaurant|Diner|Cafe|Café/i.test(name)) return "business";
  if (/Trust|Society|Cooperative/i.test(name)) return "organization";
  if (/Mansion|House/i.test(name)) return "historic-house";
  if (/Pottery|Ceramics|Bookseller|Hardware|Antiques|Auctions/i.test(name)) return "business";
  if (/Stables|Ranch/i.test(name)) return "farm";
  if (/Cellars|Wines/i.test(name)) return "business";
  if (/Inn\b/i.test(name)) return "historic-house";
  return "business";
}
