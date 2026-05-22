// Tag enrichment v2 — fixed plural regex + broader triggers.
// Idempotent: ON CONFLICT DO NOTHING. Safe to re-run.
import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 4 });

// Helper: build a case-insensitive prefix regex (handles plurals, -ed, -ing)
const p = s => new RegExp(`\\b${s}`, "i");

const RULES = [
  // ── Cuisine ──────────────────────────────────────────────────────────────
  { tag:"italian",           triggers:[p("italian"),p("pasta"),p("risotto"),p("polenta"),p("pizza"),p("gnocchi"),p("prosciutto"),p("bruschetta"),p("tiramisu"),p("panna cotta"),/\bbolognese/i,/\bosso buco/i,p("focaccia"),p("panzanella"),p("caponata"),p("tuscan")] },
  { tag:"french",            triggers:[p("french"),p("croissant"),p("quiche"),p("soufflé"),p("souffle"),p("crème brûlée"),/crème brûlée/i,p("baguette"),/\bprovençal/i,/\bprovencal/i,p("cassoulet"),p("ratatouille"),p("bouillabaisse"),p("crêpe"),p("crepe"),p("macaron"),p("éclair"),p("eclair"),p("coq au vin"),p("pâté"),/\bbistro/i,p("galette"),p("croque"),p("normandy"),p("bordeaux"),p("provence"),/france\b/i] },
  { tag:"mexican",           triggers:[p("mexican"),p("taco"),p("enchilada"),p("tamale"),p("guacamole"),/\bmole\b/i,p("burrito"),p("quesadilla"),p("jalapeño"),p("jalapeno"),p("chipotle"),p("tortilla"),p("oaxaca"),p("poblano"),p("tequila"),p("mezcal"),/mexico/i] },
  { tag:"asian",             triggers:[p("asian"),/stir.?fr/i,/soy sauce/i,/sesame/i,/dumpling/i,/potsticker/i,/wonton/i,/bok choy/i,/hoisin/i,/five.spice/i] },
  { tag:"japanese",          triggers:[p("japanese"),p("sushi"),p("sashimi"),p("teriyaki"),p("miso"),p("tempura"),p("ramen"),p("udon"),/\bsake\b/i,/kyoto/i,/tokyo/i,/kuruma zushi/i] },
  { tag:"greek",             triggers:[p("greek"),p("feta"),p("tzatziki"),p("moussaka"),p("spanakopita"),p("baklava"),/\bgyro/i,/\bpita\b/i,p("hummus"),/kalamata/i,/\bphyllo/i,/\bfilo\b/i,p("greece")] },
  { tag:"southern",          triggers:[p("southern"),/fried chicken/i,/\bbiscuit/i,/\bgrits\b/i,/cornbread/i,/collard green/i,/\bbbq\b/i,/sweet tea/i,/praline/i,/pecan pie/i] },
  { tag:"mediterranean",     triggers:[p("mediterranean"),p("falafel"),p("tahini"),/za.atar/i,/couscous/i,/harissa/i,/baba ghanoush/i,/baba.ghanoush/i,/labneh/i] },
  { tag:"indian",            triggers:[p("indian"),/\bcurry\b/i,p("masala"),/\bnaan\b/i,/chutney/i,/\bdal\b/i,/samosa/i,/tandoori/i,/turmeric/i,/garam masala/i,/butter chicken/i,/\bbasmati/i] },
  { tag:"chinese",           triggers:[p("chinese"),/dim sum/i,/lo mein/i,/fried rice/i,/hot and sour/i,/char siu/i,/peking duck/i] },
  { tag:"thai",              triggers:[p("thai"),/pad thai/i,/coconut milk/i,/lemongrass/i,/galangal/i,/fish sauce/i,/green curry/i,/red curry/i] },
  { tag:"spanish",           triggers:[p("spanish"),/paella/i,/\btapas\b/i,/sangria/i,/gazpacho/i,/\bspain\b/i,/albondigas/i] },
  { tag:"moroccan",          triggers:[p("moroccan"),/tagine/i,/ras el hanout/i,/preserved lemon/i,/chermoula/i] },
  { tag:"caribbean",         triggers:[p("caribbean"),/\bjerk\b/i,/plantain/i,/\backee\b/i,/callaloo/i,/rum punch/i,/saltfish/i,/jamaica/i,/puerto rico/i,/coconut.*shrimp/i] },
  { tag:"scandinavian",      triggers:[p("scandinavian"),p("nordic"),/aquavit/i,/pickled herring/i,/\bswedish\b/i,/\bnorwegian\b/i,/\bdanish\b/i,/smorgasbord/i,/gravlax/i,/\bstollen\b/i] },
  { tag:"eastern european",  triggers:[p("eastern european"),/\bpolish\b/i,/chrusciki/i,/kielbasa/i,/pierogi/i,/borscht/i,/ukrainian/i,/kurowycky/i,/hungarian/i,/goulash/i] },

  // ── Meal occasion ─────────────────────────────────────────────────────────
  { tag:"breakfast",         triggers:[p("breakfast"),/french toast/i,/pancake/i,/waffle/i,/oatmeal/i,/granola/i,/\bscone/i,/\bmuffin/i,/\bbagel\b/i,/\blox\b/i,/eggs benedict/i,/poached egg/i,/scrambled egg/i,/\bomelet/i] },
  { tag:"brunch",            triggers:[p("brunch"),/frittata/i,/mimosa/i,/bloody mary/i,/bellini/i] },
  { tag:"lunch",             triggers:[p("lunch"),/\bsandwich\b/i,/\bpanini\b/i,/\bwrap\b/i,/open.faced/i] },
  { tag:"dinner",            triggers:[p("dinner"),/\bsupper\b/i,/dinner party/i,/\bentrée\b/i,/\bentree\b/i,/roast.*dinner/i] },
  { tag:"dessert",           triggers:[p("dessert"),/\bcake\b/i,/\bpie\b/i,/\btart\b/i,/\bcookie/i,/ice cream/i,/sorbet/i,/gelato/i,/custard/i,/pudding/i,/\bmousse\b/i,/clafoutis/i,/trifle/i,/cobbler/i,/brownie/i,/\bfudge\b/i,/\btruffles?\b.*chocolate/i] },
  { tag:"cocktail",          triggers:[p("cocktail"),/\bmartini\b/i,/\bmojito\b/i,/sangria/i,/\bbourbon\b/i,/\bwhiskey\b/i,/\brum\b/i,/\bgin\b(?! ger)/i,/\bvodka\b/i,/champagne/i,/prosecco/i,/\bcider\b/i,/mixed drink/i,/rum punch/i] },
  { tag:"appetizer",         triggers:[p("appetizer"),/hors d.oeuvres/i,/\bstarter\b/i,/canapé/i,/canape/i,/finger food/i,/\bdip\b/i,/crostini/i] },
  { tag:"soup",              triggers:[p("soup"),/\bbisque\b/i,/chowder/i,/\bstew\b/i,/bouillabaisse/i,/goulash/i,/borscht/i,/consommé/i,/vichyssoise/i,/minestrone/i,/gazpacho/i,/chicken soup/i] },
  { tag:"salad",             triggers:[p("salad"),/vinaigrette/i,/\bcaesar\b/i,/niçoise/i,/nicoise/i,/tabbouleh/i,/coleslaw/i] },

  // ── Holidays ──────────────────────────────────────────────────────────────
  { tag:"halloween",         triggers:[p("halloween"),/jack.o.lantern/i,/\bwitch\b/i,/\bcostume/i,/pumpkin.*carv/i,/spooky/i,/trick.or.treat/i,/haunted/i,/frankenstein/i,/vampire/i,/skeleton/i,/ghost/i,/creepy/i,/dastardly/i,/halloween.*craft/i] },
  { tag:"thanksgiving",      triggers:[p("thanksgiving"),/\bturkey\b.*stuffing/i,/pumpkin pie/i,/cranberry sauce/i,/pilgrim/i,/thanksgiving table/i,/thanksgiving.*turkey/i,/thanksgiving.*decor/i,/stuffed.*turkey/i] },
  { tag:"christmas",         triggers:[p("christmas"),/holiday wreath/i,/\bornament/i,/\badvent\b/i,/\byule\b/i,/\bgarland\b/i,/\bstocking\b/i,/gingerbread house/i,/christmas tree/i,/holiday cookie/i,/holiday table/i,/holiday open house/i,/twelve days/i,/12 days/i,/holiday.*decor/i,/christmas.*dinner/i] },
  { tag:"easter",            triggers:[p("easter"),/dyeing eggs/i,/easter egg/i,/easter basket/i,/hot cross bun/i,/easter bread/i,/egg hunt/i,/easter.*flower/i,/easter.*craft/i,/greek easter/i,/ukrainian easter/i] },
  { tag:"valentine",         triggers:[p("valentine"),/heart.shaped/i,/romantic dinner/i,/heart cake/i,/rose.*bouquet/i,/valentines/i] },
  { tag:"hanukkah",          triggers:[p("hanukkah"),p("chanukah"),/latke/i,/menorah/i,/dreidel/i] },
  { tag:"new year",          triggers:[/new year/i,/good luck meal/i,/lucky.*new year/i,/countdown.*midnight/i] },
  { tag:"fourth of july",    triggers:[/fourth of july/i,/july 4/i,/independence day/i] },
  { tag:"mother's day",      triggers:[/mother.s day/i,/mothers day/i] },
  { tag:"holiday",           triggers:[p("holiday")] },

  // ── Places ────────────────────────────────────────────────────────────────
  { tag:"new york",          triggers:[/new york/i,/\bnyc\b/i,/manhattan/i,/\bbrooklyn\b/i,/\bbronx\b/i,/east hampton/i,/\bhamptons\b/i,/\bnantucket\b/i,/central park/i,/balthazar/i,/four seasons.*restaurant/i,/river cafe/i,/metropolitan museum/i,/urban archaeology/i,/secondhand rose/i,/wave hill/i,/\bsoho\b/i,/lower east side/i,/greenwich village/i] },
  { tag:"connecticut",       triggers:[/connecticut/i,/\bwestport\b/i,/\bbedford\b/i,/turkey hill/i,/skylands/i,/lily pond/i,/\bgreenwich\b.*connecticut/i] },
  { tag:"maine",             triggers:[/\bmaine\b/i,/bar harbor/i,/lobster.*maine/i,/portland.*maine/i] },
  { tag:"california",        triggers:[/california/i,/napa valley/i,/\bsonoma\b/i,/los angeles/i,/san francisco/i,/\bnapa\b/i] },
  { tag:"italy",             triggers:[/\bitaly\b/i,/tuscany/i,/\brome\b/i,/florence/i,/\bvenice\b/i,/\bmilan\b/i,/amalfi/i,/sicil/i] },
  { tag:"france",            triggers:[/\bfrance\b/i,/\bparis\b/i,/provence/i,/bordeaux/i,/normandy/i,/alsace/i] },
  { tag:"mexico",            triggers:[/\bmexico\b/i,/\boaxaca\b/i,/yucatan/i] },
  { tag:"japan",             triggers:[/\bjapan\b/i,/\btokyo\b/i,/\bkyoto\b/i] },
  { tag:"hawaii",            triggers:[/hawaii/i,/hawaiian/i,/\bmaui\b/i,/\bluau\b/i,/\bpoke\b/i] },
  { tag:"jamaica",           triggers:[/\bjamaica\b/i,/jerk chicken/i,/\backee\b/i] },
  { tag:"london",            triggers:[/\blondon\b/i,/\bbritish\b/i,/english.*food/i] },

  // ── Main ingredients & subjects ───────────────────────────────────────────
  { tag:"chicken",           triggers:[/\bchicken/i,/\bpoultry\b/i,/coq au vin/i,/jerk chicken/i,/roast.*chicken/i] },
  { tag:"beef",              triggers:[/\bbeef\b/i,/\bsteak\b/i,/\bsirloin\b/i,/\brib roast\b/i,/\bpot roast\b/i,/\bbrisket\b/i,/\bground beef\b/i,/\bmeatball/i,/\bburger\b/i,/chateaubriand/i,/tenderloin.*beef/i] },
  { tag:"fish",              triggers:[/\bsalmon\b/i,/\btuna\b/i,/\bcod\b/i,/\bhalibut\b/i,/\btrout\b/i,/\bflounder\b/i,/\bsole\b(?! proprietor)/i,/\bswordfish\b/i,/\bbrandade\b/i,/gravlax/i,/smoked fish/i,/whole fish/i,/cook.*fish/i,/baked fish/i,/grilled fish/i,/poached fish/i] },
  { tag:"seafood",           triggers:[/seafood/i,/\blobster\b/i,/\bcrab\b/i,/\bshrimp\b/i,/\bscallop/i,/\boyster/i,/\bclam\b/i,/\bmussel/i,/\bsquid\b/i,/\bpraw/i,/shellfish/i] },
  { tag:"lobster",           triggers:[/lobster/i] },
  { tag:"lamb",              triggers:[/\blamb\b/i,/leg of lamb/i,/rack of lamb/i,/lamb chop/i] },
  { tag:"pork",              triggers:[/\bpork\b/i,/\bham\b/i,/\bbacon\b/i,/prosciutto/i,/pancetta/i,/\bsausage\b/i,/\bsalami\b/i,/pork tenderloin/i,/pork shoulder/i,/pork ribs/i,/\bchorizo\b/i,/kielbasa/i] },
  { tag:"pasta",             triggers:[/\bpasta\b/i,/spaghetti/i,/fettuccine/i,/\bpenne\b/i,/rigatoni/i,/linguine/i,/\bgnocchi\b/i,/ravioli/i,/lasagna/i,/carbonara/i,/\borzo\b/i,/cacio e pepe/i] },
  { tag:"bread",             triggers:[/\bbread\b/i,/\bbaguette\b/i,/sourdough/i,/\bbrioche\b/i,/focaccia/i,/\bchallah\b/i,/no.?knead/i,/cornbread/i,/\bbiscuit/i,/breadstick/i,/\brolls?\b(?! cake)/i] },
  { tag:"cake",              triggers:[/\bcake\b/i,/\bcupcake/i,/layer cake/i,/\bbundt\b/i,/chiffon cake/i,/pound cake/i,/cheesecake/i,/sponge cake/i,/angel food/i,/carrot cake/i,/coconut cake/i,/chocolate cake/i] },
  { tag:"cookies",           triggers:[/\bcookie/i,/\bmacaron/i,/shortbread/i,/snickerdoodle/i,/sugar cookie/i,/gingerbread cookie/i,/biscotti/i,/chrusciki/i,/linzer/i,/meltaway/i] },
  { tag:"pie",               triggers:[/\bpie\b/i,/\btart\b/i,/galette/i,/clafoutis/i,/pie crust/i,/pie dough/i,/apple pie/i,/pumpkin pie/i,/pecan pie/i,/lemon tart/i] },
  { tag:"chocolate",         triggers:[/chocolate/i,/\bcocoa\b/i,/\bganache\b/i,/\bfudge\b/i,/dark chocolate/i] },
  { tag:"pumpkin",           triggers:[/pumpkin/i] },
  { tag:"mushrooms",         triggers:[/mushroom/i,/\bporcini\b/i,/shiitake/i,/chanterelle/i,/\bmorel\b/i,/portobello/i,/\btruffle\b(?! chocolate)/i] },
  { tag:"eggs",              triggers:[/\begg/i,/frittata/i,/\bomelet/i,/deviled egg/i,/poached egg/i,/scrambled egg/i,/eggs benedict/i] },
  { tag:"cheese",            triggers:[/\bcheese\b/i,/parmesan/i,/mozzarella/i,/\bbrie\b/i,/\bcheddar\b/i,/goat cheese/i,/gruyere/i,/gruyère/i,/gorgonzola/i,/pecorino/i,/ricotta/i,/camembert/i,/fromage/i] },
  { tag:"herbs",             triggers:[/\bherb/i,/\bbasil\b/i,/\bthyme\b/i,/rosemary/i,/\bmint\b(?! condition)/i,/\bparsley\b/i,/\borgano\b/i,/tarragon/i,/\bsage\b(?! advice)/i,/\bchive/i,/\bdill\b/i,/cilantro/i] },
  { tag:"flowers",           triggers:[/\bflower/i,/\bfloral\b/i,/\bbouquet\b/i,/arrangement/i,/centerpiece/i,/hydrangea/i,/\bpeony/i,/\btulip/i,/daffodil/i,/\blilac\b/i,/\bdahlia\b/i,/\borchid\b/i] },
  { tag:"roses",             triggers:[/\brose/i] },
  { tag:"tomatoes",          triggers:[/tomato/i] },
  { tag:"apples",            triggers:[/\bapple/i] },
  { tag:"berries",           triggers:[/berr/i,/strawberr/i,/blueberr/i,/raspberr/i,/blackberr/i,/cranberr/i] },
  { tag:"lemon",             triggers:[/\blemon\b/i] },
  { tag:"garlic",            triggers:[/\bgarlic\b/i] },
  { tag:"onion",             triggers:[/\bonion/i] },
  { tag:"potatoes",          triggers:[/potato/i,/\bspud\b/i] },
  { tag:"rice",              triggers:[/\brice\b/i,/risotto/i,/basmati/i,/fried rice/i] },
  { tag:"corn",              triggers:[/\bcorn\b/i,/cornbread/i,/polenta/i] },
  { tag:"figs",              triggers:[/\bfig/i] },
  { tag:"wine",              triggers:[/\bwine\b/i] },

  // ── Home & crafts ──────────────────────────────────────────────────────────
  { tag:"crafts",            triggers:[/\bcraft/i,/\bdiy\b/i,/handmade/i,/\bknitting\b/i,/crocheting/i,/\bsewing\b/i,/decoupage/i,/origami/i,/wreath.mak/i,/block printing/i,/linoleum/i,/quilting/i] },
  { tag:"knitting",          triggers:[/knitting/i,/crochet/i,/\byarn\b/i,/needlework/i,/felting/i] },
  { tag:"pottery",           triggers:[/pottery/i,/ceramic/i,/\bclay\b/i,/wheel.*throw/i,/\bglaze\b/i] },
  { tag:"organizing",        triggers:[/organiz/i,/organis/i,/storage/i,/medicine cabinet/i,/pantry.*tips/i,/declutter/i,/spring cleaning/i,/closet/i,/household tips/i,/bathroom.*tips/i,/bathroom makeover/i,/household.*organiz/i,/afterschool/i,/after.school/i] },
  { tag:"home repair",       triggers:[/repair/i,/fix.it/i,/maintenance/i,/\bpaint\b/i,/staining/i,/woodwork/i,/carpentry/i,/plumbing/i,/electrical/i,/\bgrouting\b/i,/\btile\b/i,/\bfloor\b/i,/wall.*paper/i,/\brefinish/i,/\brestoring\b/i,/restoration/i,/\bhinckley\b/i] },
  { tag:"decorating",        triggers:[/decorating/i,/\bdécor\b/i,/\bdecor\b/i,/interior design/i,/room makeover/i,/wallpaper/i,/\bupholstery\b/i,/\bfurniture.*refin/i,/\bantiques?\b/i] },
  { tag:"gardening",         triggers:[/\bgarden/i,/\bplanting\b/i,/\bseeds?\b/i,/compost/i,/\bpruning\b/i,/\bsoil\b/i,/\bmulch\b/i,/potager/i,/seedling/i,/transplant/i,/\bbulb\b/i,/greenhouse/i,/nursery.*plant/i,/flowering plant/i,/overwintering/i,/growing.*plant/i,/knotted.*garden/i,/knot.*herb garden/i] },
  { tag:"preserving",        triggers:[/canning/i,/\bpreserve/i,/\bjam\b/i,/\bpickling/i,/putting up/i,/\bferment/i,/water.bath/i] },
  { tag:"entertaining",      triggers:[/entertaining/i,/dinner party/i,/\bhosting\b/i,/\bbuffet\b/i,/table setting/i,/napkin fold/i,/place setting/i,/party.*food/i,/holiday.*entertain/i,/hosting tips/i] },
  { tag:"wedding",           triggers:[/wedding/i,/\bbridal\b/i,/engagement/i,/vera wang/i] },

  // ── Animals & outdoors ────────────────────────────────────────────────────
  { tag:"pets",              triggers:[/\bdog\b/i,/\bcat\b(?! alogue)/i,/\bhorse\b/i,/\bbird\b/i,/parrot/i,/chicken coop/i,/\banimals?\b/i,/\bkennel\b/i,/aquarium/i,/veterinar/i,/pet care/i,/bronx zoo/i,/westminster.*dog/i,/dog show/i,/\bavian\b/i,/polar bear/i,/petkeeping/i] },
  { tag:"grilling",          triggers:[/\bgrilling/i,/barbecue/i,/\bbbq\b/i,/grill.*meat/i] },

  // ── Field trips ────────────────────────────────────────────────────────────
  { tag:"field trip",        triggers:[/field trip/i] },
  { tag:"restaurant",        triggers:[/\brestaurant\b/i,/\bbistro\b/i,/dining at/i] },
  { tag:"market",            triggers:[/farmers market/i,/fish market/i,/food market/i,/flea market/i] },

  // ── Health ─────────────────────────────────────────────────────────────────
  { tag:"healthy",           triggers:[/\bhealthy/i,/\bwellness\b/i,/nutrition/i,/low.fat/i,/gluten.free/i] },

  // ── Baking general ────────────────────────────────────────────────────────
  { tag:"baking",            triggers:[/\bbaking\b/i,/\bbaked\b/i] },

  // ── Special episode types ──────────────────────────────────────────────────
  { tag:"kids",              triggers:[/\bkids?\b/i,/children/i,/afterschool/i,/after.school/i,/\bschool\b/i,/family.*craft/i,/\bbirthday.*kid/i] },
  { tag:"american classics", triggers:[/american classics/i,/american.*tradition/i,/american.*comfort/i] },
  { tag:"side dish",         triggers:[/side dish/i,/sides\b/i] },
  { tag:"behind the scenes", triggers:[/behind.*scene/i,/studio.*tour/i,/bloopers/i,/making of/i] },
];

// ─── Load all episodes with existing tags ─────────────────────────────────
console.log("[enrich] loading episodes…");
const episodes = await sql`
  SELECT e.id, e.title, e.description,
         COALESCE(array_agg(DISTINCT r.name), '{}') AS recipe_names,
         COALESCE(array_agg(DISTINCT tp.topic), '{}') AS topics,
         COALESCE(array_agg(DISTINCT th.theme), '{}') AS themes,
         COALESCE(array_agg(DISTINCT et.tag), '{}') AS existing_tags
  FROM episodes e
  LEFT JOIN episode_recipes r ON r.episode_id = e.id
  LEFT JOIN episode_topics tp ON tp.episode_id = e.id
  LEFT JOIN episode_themes th ON th.episode_id = e.id
  LEFT JOIN episode_tags et ON et.episode_id = e.id
  GROUP BY e.id
`;
console.log(`[enrich] loaded ${episodes.length} episodes`);

function makeText(ep) {
  return [
    ep.title || "",
    ep.description || "",
    ...(ep.recipe_names || []),
    ...(ep.topics || []),
    ...(ep.themes || []),
  ].join(" ");
}

const toInsert = [];
let skipped = 0;
let added = 0;

for (const ep of episodes) {
  const text = makeText(ep);
  const existingLower = new Set((ep.existing_tags || []).map(t => t.toLowerCase().trim()));

  for (const rule of RULES) {
    const tl = rule.tag.toLowerCase();
    if (existingLower.has(tl)) { skipped++; continue; }
    const matches = rule.triggers.some(t => t instanceof RegExp ? t.test(text) : text.toLowerCase().includes(t));
    if (matches) {
      toInsert.push({ episode_id: ep.id, tag: rule.tag });
      existingLower.add(tl);
      added++;
    }
  }
}

console.log(`[enrich] ${added} new tags to insert, ${skipped} already present`);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

let inserted = 0;
for (const batch of chunk(toInsert, 500)) {
  await sql`INSERT INTO episode_tags ${sql(batch)} ON CONFLICT DO NOTHING`;
  inserted += batch.length;
  process.stdout.write(`[enrich] ${inserted}/${toInsert.length}\r`);
}
console.log(`\n[enrich] done — ${inserted} tags written`);

// ─── Coverage report ───────────────────────────────────────────────────────
const coverage = await sql`
  SELECT tag_count, count(*)::int ep_count FROM (
    SELECT e.id,
      count(et.id) FILTER (WHERE et.tag !~ '^[0-9]{4}$') AS tag_count
    FROM episodes e LEFT JOIN episode_tags et ON et.episode_id = e.id
    GROUP BY e.id
  ) sub
  GROUP BY tag_count ORDER BY tag_count LIMIT 14
`;
console.log("\n[enrich] tag distribution after run:");
for (const r of coverage) console.log(`  ${r.tag_count} tags: ${r.ep_count} episodes`);

// ─── Spot-check target searches ────────────────────────────────────────────
const checks = [
  "brunch","new york","italian","halloween","pumpkin","lobster","christmas",
  "gardening","french","cookies","field trip","organizing","grilling","caribbean",
  "pasta","soup","entertaining","breakfast","baking","crafts","eggs","pets",
  "Snoop Dogg",
];
console.log("\n[enrich] search coverage:");
for (const t of checks) {
  const cnt = await sql`SELECT count(*)::int c FROM episode_tags WHERE lower(tag) = lower(${t})`;
  console.log(`  "${t}": ${cnt[0].c} episodes`);
}

await sql.end();
