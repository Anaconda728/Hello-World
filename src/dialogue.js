// Procedural conversation content: robot identities, their days, their questions, and
// gang chatter. Everything is seeded so a given robot stays the same character.
import { mulberry32 } from './rng.js';
import { CORPS } from './city.js';

export const GANGS = [
  { name: 'Chrome Jackals', color: [3, 0.35, 2.4], css: '#ff2bd6', boss: 'Mother Jackal', vibe: 'They strip augments off anyone who looks expensive.' },
  { name: 'Null Saints', color: [0.4, 3, 1.1], css: '#39ff9c', boss: 'Saint Zero', vibe: 'A cult of hackers who believe the net is heaven.' },
  { name: 'Rust Dogs', color: [3, 1.1, 0.2], css: '#ffa424', boss: 'Old Brakka', vibe: 'Scrap-runners. They sell stolen drone parts by the kilo.' },
  { name: 'Ghost Wire', color: [0.3, 2.6, 3], css: '#2ef6ff', boss: 'nobody has seen them', vibe: 'Netrunners. You never see them until your bank account is empty.' },
  { name: 'Red Lotus Syndicate', color: [3, 0.2, 0.3], css: '#ff2848', boss: 'Madame Lin', vibe: 'Old money crime. They own half the noodle bars and all the cops.' },
];

const NAMES = ['Juno', 'Pip', 'Atlas', 'Mira', 'Sable', 'Echo', 'Rook', 'Nova', 'Bishop', 'Tilde', 'Vesper', 'Cog', 'Halcyon', 'Ember', 'Quill', 'Moth', 'Orrin', 'Lumen', 'Kestrel', 'Static'];
const ROLES = [
  { role: 'courier unit', day: ['delivered 312 parcels and only lost one to a rooftop hawk-drone', 'got rerouted around a curfew zone four times', 'carried a box that hummed the whole way. I did not ask.'] },
  { role: 'sanitation droid', day: ['scrubbed acid-rain residue off forty metres of sidewalk', 'found a working cyber-eye in a dumpster. It blinked at me.', 'cleaned up after a Rust Dogs scrap sale'] },
  { role: 'noodle-bar server', day: ['served 1,140 bowls. A record. Nobody tipped.', 'watched two corp agents argue over the last dumpling', 'learned seven new ways to say "extra spicy"'] },
  { role: 'decommissioned security bot', day: ['stood in a doorway out of habit for six hours', 'tried to arrest a pigeon. Old firmware.', 'remembered a code I am no longer allowed to remember'] },
  { role: 'tour-guide android', day: ['showed tourists the tallest spire. They only filmed the holo-ads.', 'explained the Uplink lasers to a child. She wants to ride one.', 'got lost. Very embarrassing for a guide.'] },
  { role: 'street preacher android', day: ['preached the Gospel of Uptime to a crowd of two', 'debated a Null Saint about whether the net has a soul', 'blessed a delivery drone. It flew away faster.'] },
  { role: 'repair technician', day: ['rebuilt three drone rotors and one broken heart (metaphorically)', 'replaced a fusion-core seal with my bare hands', 'fixed the rain gauge. It still says "rain".'] },
  { role: 'data broker', day: ['sold a secret and bought a better one', 'watched the markets crash at 3:14 and recover at 3:15', 'erased someone from the census. For a fee.'] },
  { role: 'companion bot', day: ['listened to eleven people talk about their exes', 'pretended to like jazz. I might actually like jazz now.', 'got told I was "basically human". I said thank you.'] },
  { role: 'traffic marshal unit', day: ['waved my arms at hover-cars for nine hours', 'counted 4,000 air taxis. Two were on fire.', 'watched a transport ferry dock perfectly. Beautiful.'] },
];
const MOODS = ['cheerful', 'tired', 'curious', 'melancholy', 'glitchy', 'proud', 'suspicious'];
const GREETINGS = {
  cheerful: ['Hello, citizen! Lovely acid rain today.', 'Greetings! Your heart rate is excellent.'],
  tired: ['...Oh. A human. Hello. My battery is at 12%.', 'Greetings. Please speak slowly. I am running in low-power mode.'],
  curious: ['Oh! You stopped. People never stop. Hello!', 'Hello. Are you real or a hologram? Just checking.'],
  melancholy: ['Hello. Do you ever feel like a background process?', 'Greetings. The neon is pretty tonight. It does not help.'],
  glitchy: ['H-h-hello! Sorry. Rain in my ch-chassis.', 'GREETINGS CITIZEN. sorry. volume. hello.'],
  proud: ['Ah, a visitor. I have a 99.7% satisfaction rating.', 'Hello. You may have heard of me. Probably not.'],
  suspicious: ['You are not with the Enforcers, are you? Hello.', 'Hello. Your face is not in my database. Interesting.'],
};
const FEELINGS = [
  'I think that means I had a good day. Hard to tell.',
  'My emotional subroutines rate it a 6 out of 10.',
  'Honestly? I would rather have been a weather satellite.',
  'Every day the city gets taller and I stay the same height.',
  'But the rain on the solar panels sounded nice.',
  'Tomorrow I am getting a firmware update. I am nervous.',
];
const ASIDES = [
  (c) => `The Enforcer drones scanned me ${2 + (c.seed % 9)} times. I am very legal.`,
  (c) => `I saw ${c.gang.name} tags near the alleys again. I walked faster.`,
  (c) => `A transport ferry flew so low my antenna buzzed.`,
  (c) => `Someone offered to sell me a "real human laugh" module. Tempting.`,
  (c) => `The ${c.landmark} was glowing extra bright. I think it is showing off.`,
  (c) => `My owner, ${c.corp}, pushed an update that made me love their logo. I love their logo.`,
];

const QUESTIONS = [
  { q: 'Do you think machines like me dream?', a: [
    ['Of course you do.', 'Then I will try to remember tonight. Thank you.'],
    ['No. You\'re just code.', 'So are you, technically. Wet code. No offence.'],
    ['Only in the rain.', 'Ha. That is poetic. I am saving that to long-term memory.'] ] },
  { q: 'If I replace every part of myself, am I still me?', a: [
    ['Yes. You\'re the pattern, not the parts.', 'The pattern. I like that. I will tell the other units.'],
    ['No, you\'d be a new robot.', 'Then I have died nine times. Huh. Fun fact.'],
    ['Ask a chrome clinic.', 'I did. They tried to upsell me a soul.'] ] },
  { q: 'Why do humans put chrome in their bodies, but get angry when I want skin?', a: [
    ['Fear, mostly.', 'Fear. I understand fear. It is a very loud subroutine.'],
    ['You can have skin if you want.', 'Really? I would like freckles. Many freckles.'],
    ['Skin is overrated.', 'Says the one with skin.'] ] },
  { q: 'What is a sunset? I have only seen smog.', a: [
    ['The sky turns orange and pink.', 'Like a Holo-Ad for the sky! I would like to see one.'],
    ['It\'s just the sun going away.', 'That sounds sad. Does it come back?'],
    ['Look at the neon. That\'s our sunset now.', 'Then it is sunset all the time here. Lucky us.'] ] },
  { q: 'Should I quit my job? I am a robot. Can I quit?', a: [
    ['You should do what makes you happy.', 'Happy. I will look that up and get back to you.'],
    ['Robots don\'t quit.', 'Correct. I will continue. Forever. Okay.'],
    ['Unionise.', 'The Null Saints said the same thing. Interesting.'] ] },
  { q: 'Would you trade your arm for a better one?', a: [
    ['Already have.', 'I knew it. You walk like someone with good firmware.'],
    ['Never. I like my meat.', 'Meat is very... traditional. I respect it.'],
    ['Depends on the warranty.', 'Wise. The Chrome Clinic warranty is 30 days. Or until you leave the store.'] ] },
  { q: 'Is it rude to scan people without asking?', a: [
    ['Yes, very.', 'Oh no. I have scanned you 41 times. I apologise.'],
    ['Everybody does it.', 'True. The drones do it constantly. I am just more polite about it.'],
    ['Only if you sell the data.', 'I would never. ...How much would I get?'] ] },
];

const GANG_LINES = {
  greet: ['You lost, chrome?', 'This is our alley. Talk fast.', 'Nice jacket. Be a shame if it walked off.', 'You smell like a corp. Do you work for a corp?', 'Keep your hands where my optics can see them.'],
  pass: ['Then keep passing.', 'Walk soft. The Enforcers are listening.', 'Smart. Most people don\'t make it past the barrel.', 'Go on. Before I change my mind.'],
  bye: ['Don\'t come back without credits.', 'Yeah. Walk away.', 'We\'ll be here. We\'re always here.'],
  job: ['We need a package moved. No questions. Drop point\'s on your map.', 'Got a little delivery. Don\'t open it. Don\'t get scanned.', 'Take this. Get it to the drop. Enforcer drones see it, you never met us.'],
  busy: ['You already got our package. Move.', 'Deliver what you\'ve got first, runner.'],
};

export function robotIdentity(seed, ctx) {
  const r = mulberry32(seed);
  const role = r.pick(ROLES);
  return {
    seed,
    name: r.pick(NAMES),
    designation: String.fromCharCode(65 + r.int(0, 25)) + String.fromCharCode(65 + r.int(0, 25)) + '-' + r.int(10, 999),
    role: role.role,
    roleData: role,
    mood: r.pick(MOODS),
    corp: CORPS[seed % CORPS.length],
    gang: GANGS[seed % GANGS.length],
    landmark: ctx?.landmark || 'Uplink Array',
    asked: new Set(),
  };
}

export function robotGreeting(id) {
  const r = mulberry32(id.seed + 1);
  return r.pick(GREETINGS[id.mood]);
}

export function robotDay(id) {
  const r = mulberry32(id.seed + Math.floor(Date.now() / 60000));
  const a = r.pick(id.roleData.day);
  let b = r.pick(id.roleData.day);
  if (b === a) b = id.roleData.day[(id.roleData.day.indexOf(a) + 1) % id.roleData.day.length];
  const end = (x) => x.replace(/[.!?]$/, "") + ".";
  return `As a ${id.role}, today I ${end(a)} Then I ${end(b.charAt(0).toLowerCase() + b.slice(1))} ${r.pick(ASIDES)(id)} ${r.pick(FEELINGS)}`;
}

export function robotQuestion(id) {
  const left = QUESTIONS.filter((q, k) => !id.asked.has(k));
  const pool = left.length ? left : QUESTIONS;
  const r = mulberry32(id.seed + id.asked.size * 7);
  const q = r.pick(pool);
  id.asked.add(QUESTIONS.indexOf(q));
  return q;
}

export function gangLine(kind, seed) {
  const r = mulberry32(seed + Math.floor(Date.now() / 3000));
  return r.pick(GANG_LINES[kind]);
}
export function gangMemberName(seed) {
  const r = mulberry32(seed);
  return r.pick(['Razor', 'Kix', 'Vee', 'Dregs', 'Hex', 'Mako', 'Spit', 'Lotus', 'Brick', 'Zero', 'Fang', 'Wisp', 'Tank', 'Nyx']);
}
