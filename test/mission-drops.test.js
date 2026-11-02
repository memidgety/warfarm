const assert = require('node:assert/strict');
const test = require('node:test');

const app = require('../server');

const dropPage = `
<h3 id="missionRewards">Missions:</h3><table>
<tr><th colspan="2">Earth/Test (Survival)</th></tr>
<tr><th colspan="2">Rotation A</th></tr>
<tr><td>Mission Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="relicRewards">Relics:</h3><table>
<tr><th colspan="2">Lith A1 Relic (Intact)</th></tr>
<tr><td>Relic Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="keyRewards">Keys:</h3><table>
<tr><th colspan="2">Quest Key</th></tr>
<tr><th colspan="2">Rotation A</th></tr>
<tr><td>Key Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="transientRewards">Dynamic Location Rewards:</h3><table>
<tr><th colspan="2">Arbitrations</th></tr>
<tr><th>Rotation A</th><td></td></tr>
<tr><td>Dynamic Mod</td><td>Rare (100.00%)</td></tr>
</table>
<h3 id="sortieRewards">Sorties:</h3><table>
<tr><th colspan="2">Sortie</th></tr>
<tr><td>Sortie Mod</td><td>Rare (100.00%)</td></tr>
</table>
<h3 id="cetusRewards">Cetus Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 5 - 15 Cetus Bounty</th></tr>
<tr><th colspan="3">Rotation A</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Stage 1</th></tr>
<tr><td></td><td>Cetus Mod</td><td>Uncommon (100.00%)</td></tr>
</table>
<h3 id="solarisRewards">Orb Vallis Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 5 - 15 Orb Vallis Bounty</th></tr>
<tr><th colspan="3">Rotation A</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Stage 1</th></tr>
<tr><td></td><td>Orb Vallis Stage 1 Mod</td><td>Uncommon (50.00%)</td></tr>
<tr><td></td><td>Orb Vallis Stage 1 Part</td><td>Uncommon (50.00%)</td></tr>
<tr><td class="pad-cell"></td><th colspan="2">Stage 2, Stage 3 of 4, and Stage 3 of 5</th></tr>
<tr><td></td><td>Orb Vallis Stage 2 Mod</td><td>Common (100.00%)</td></tr>
<tr><th colspan="3">Rotation B</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Stage 1</th></tr>
<tr><td></td><td>Orb Vallis Stage 1 Mod</td><td>Uncommon (100.00%)</td></tr>
<tr><th colspan="3">Rotation C</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Stage 1</th></tr>
<tr><td></td><td>Orb Vallis Stage 1 Part</td><td>Uncommon (100.00%)</td></tr>
</table>
<h3 id="deimosRewards">Cambion Drift Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 5 - 15 Cambion Drift Bounty</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Final stage</th></tr>
<tr><td></td><td>Deimos Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="zarimanRewards">Zariman Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 50 - 55 Zariman Bounty</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Final stage</th></tr>
<tr><td></td><td>Zariman Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="entratiLabRewards">Albrecht's Laboratories Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 55 - 60 Entrati Lab Bounty</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Final stage</th></tr>
<tr><td></td><td>Lab Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="hexRewards">Hex Bounty Rewards:</h3><table>
<tr><th colspan="3">Level 55 - 60 WF1999 Bounty</th></tr>
<tr><td class="pad-cell"></td><th colspan="2">Final stage</th></tr>
<tr><td></td><td>Hex Mod</td><td>Common (100.00%)</td></tr>
</table>
<h3 id="modByAvatar">Mod Drops by Source:</h3><table>
<tr><th>Mod by Source</th><td>Excluded</td></tr>
</table>`;

test('parses standalone reward sections and excludes by-source indexes', () => {
  const entries = app.parseDropPage(dropPage);
  assert.deepEqual([...new Set(entries.map((entry) => entry.category))], [
    'Missions',
    'Keys',
    'Dynamic locations',
    'Sorties',
    'Cetus Bounty Rewards',
    'Orb Vallis Bounty Rewards',
    'Cambion Drift Bounty Rewards',
    'Zariman Bounty Rewards',
    "Albrecht's Laboratories Bounty Rewards",
    'Hex Bounty Rewards',
  ]);
  assert.equal(entries.some((entry) => entry.name.includes('by Source')), false);

  const orb = entries.find((entry) => entry.category === 'Orb Vallis Bounty Rewards');
  assert.ok(orb);
  assert.deepEqual(Object.keys(orb.rotations), [
    'A - Stage 1',
    'A - Stage 2, Stage 3 of 4, and Stage 3 of 5',
    'B - Stage 1',
    'C - Stage 1',
  ]);
  assert.deepEqual(orb.rotations['A - Stage 1'], [
    ['Orb Vallis Stage 1 Mod', 50],
    ['Orb Vallis Stage 1 Part', 50],
  ]);
  assert.deepEqual(orb.rotations['A - Stage 2, Stage 3 of 4, and Stage 3 of 5'], [
    ['Orb Vallis Stage 2 Mod', 100],
  ]);
  assert.deepEqual(orb.rotations['B - Stage 1'], [['Orb Vallis Stage 1 Mod', 100]]);
  assert.deepEqual(orb.rotations['C - Stage 1'], [['Orb Vallis Stage 1 Part', 100]]);

  app.useCache({ items: [], stats: {}, drops: { entries, relics: {} } });
  const bounty = app.missionTypeTable().find((entry) => entry.category === 'Orb Vallis Bounty Rewards');
  assert.ok(bounty);
  assert.deepEqual(bounty.nodes.map((n) => n.name).sort(), ['Rotation A', 'Rotation B', 'Rotation C']);
  const rotA = bounty.nodes.find((n) => n.name === 'Rotation A');
  assert.deepEqual(Object.keys(rotA.rewards), ['Stage 1', 'Stage 2, Stage 3 of 4, and Stage 3 of 5']);
  assert.equal(rotA.weights['Stage 1'], 1);
  assert.equal(rotA.basis, 'Sum of stages');
});

test('adds relic pools to the reward table without changing relic cache shape', () => {
  app.useCache({
    items: [],
    stats: {},
    drops: {
      entries: app.parseDropPage(dropPage),
      relics: app.parseRelics(dropPage),
    },
  });

  const types = app.missionTypeTable();
  const relic = types.find((entry) => entry.category === 'Relics' && entry.type === 'Relic (Intact)');
  assert.ok(relic);
  assert.deepEqual(relic.nodes.map((node) => node.name), ['Lith A1 Relic (Intact)']);
  assert.deepEqual(relic.nodes[0].rewards.A.map((reward) => reward.name), ['Relic Mod']);
});