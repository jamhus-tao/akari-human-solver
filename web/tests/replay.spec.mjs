import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
async function open(page){await page.goto('/web/?replay=daily-648-proof');await expect(page.locator('#puzzle-meta')).toContainText('No. 648');}
test('replays branches, fast components and all 26 steps without browser errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await page.screenshot({path:path.join(root,'output/screenshots/initial-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Step 6, brain cost 4',exact:true}).click();
 await expect(page.locator('#center-list .center-id')).toHaveText(['1','2']);
 await page.locator('[data-phase="branch"]').click();await expect(page.locator('#branch-verdict')).toContainText('Compatible');
 await expect(page.locator('#candidate-controls select')).toHaveCount(0);
 await expect(page.locator('#branch-list button').first()).toHaveAttribute('data-status','compatible');
 await expect(page.locator('#board [data-cell="(2,6)"]')).toHaveAttribute('aria-label','(2,6) Lamp');
 await expect(page.locator('#board [data-cell="(1,8)"]')).toHaveAttribute('aria-label','(1,8) Blank');
 await page.screenshot({path:path.join(root,'output/screenshots/step6-hypothesis.png'),fullPage:true});
 await page.locator('[data-phase="conclusion"]').click();await expect(page.locator('#state-pill')).toContainText('not committed');
 await page.getByRole('button',{name:'Step 7, fast mark',exact:true}).click();
 await expect(page.locator('#center-list .center-id')).toHaveText(['0','0','0']);
 await expect(page.locator('#board text.overlay').filter({hasText:'0'})).toHaveCount(3);
 await expect(page.locator('#all-components')).toHaveText('Show each');
 await expect(page.locator('#branch-section')).toBeHidden();
 await expect(page.locator('#result-section')).toBeVisible();
 await page.locator('#component-list button').nth(1).click();
 await expect(page.locator('#all-components')).toHaveText('Click Show each');
 await expect(page.locator('#all-components')).toHaveClass(/attention/);
 await expect(page.locator('#center-list .center-id')).toHaveText(['0','0','0']);
 await page.locator('#all-components').click();
 await expect(page.locator('#all-components')).toHaveText('Show batch');
 await expect(page.locator('#branch-section')).toBeVisible();
 await expect(page.locator('#result-section')).toBeHidden();
 await page.locator('#component-list button').nth(1).click();
 await expect(page.locator('#center-list .center-id')).toHaveText('0');
 await expect(page.locator('#board text.overlay').filter({hasText:'0'})).toHaveCount(1);
 await expect(page.locator('#dedup-note')).toBeHidden();await expect(page.locator('#state-pill')).toContainText('Hypothesis');
 await page.locator('[data-phase="before"]').click();await expect(page.locator('#board [data-cell="(1,8)"]')).toHaveAttribute('aria-label','(1,8) Blank');
 for(let i=1;i<=26;i++){await page.locator(`#timeline button[data-index="${i}"]`).click();await expect(page.locator('#step-counter')).toContainText(String(i).padStart(2,'0'));}
 await page.locator('[data-phase="after"]').click();await expect(page.locator('#progress-label')).toContainText('72 lit');expect(errors).toEqual([]);
});
test('imports original grid, validates mismatches and displays uploaded reference image',async({page})=>{
 await open(page);await page.locator('#import-open').click();
 await page.locator('#report-file').setInputFiles(path.join(root,'tests/fixtures/legacy-v6-daily.json'));
 await page.locator('#puzzle-file').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('[[-1]]')});
 await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#import-error')).toContainText('different puzzles');
 await page.locator('#puzzle-file').setInputFiles(path.join(root,'data/daily-2026-10-15.json'));await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#import-dialog')).not.toBeVisible();
 const png=await page.locator('#board').screenshot();await page.locator('#import-open').click();await page.locator('#puzzle-file').setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#reference-image-link')).toBeVisible();
 await expect(page.locator('#reference-image-link')).toHaveAttribute('href',/^blob:/);await expect(page.locator('#reference-image-link')).toHaveAttribute('target','_blank');await expect(page.locator('#reference-panel')).toHaveCount(0);
});
test('mobile layout, controls, keyboard and play/pause',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('#timeline button[data-index="1"]').click();await expect(page.locator('#step-counter')).toContainText('01');
 await page.locator('#next').click();await expect(page.locator('#step-counter')).toContainText('02');
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveAttribute('aria-label','Pause playback');await page.locator('#play').click();
 await page.screenshot({path:path.join(root,'output/screenshots/mobile-step2.png'),fullPage:true});
 await page.locator('#board [data-cell="(1,6)"]').click();await expect(page.locator('#cell-inspector')).toContainText('(1,6)');
});
test('schema errors cannot replace valid loaded replay and malicious strings stay text',async({page})=>{
 await open(page);const report=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy-v6-daily.json')));report.schema_version=4;
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#import-error')).toContainText('schema v6');
 report.schema_version=6;report.puzzle.author='<img src=x onerror="window.pwned=true">';await page.locator('#report-file').setInputFiles({name:'safe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#puzzle-meta')).toContainText('<img');expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
test('original board opens an external puzzle tab and server boundaries stay restricted',async({page,request})=>{
 await open(page);
 await expect(page.locator('#reference-panel,#original-svg')).toHaveCount(0);
 const link=page.locator('#original-board');
 await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');
 const href=await link.getAttribute('href');expect(href).toMatch(/^https:\/\/puzz\.link\/p\?akari\/10\/10\//);
 await page.context().route('https://puzz.link/**',route=>route.fulfill({body:'External original puzzle',contentType:'text/html'}));
 const popupPromise=page.waitForEvent('popup');await link.click();const popup=await popupPromise;await popup.waitForLoadState();expect(popup.url()).toBe(href);await popup.close();
 expect(page.url()).toContain('/web/?replay=daily-648-proof');
 for(const url of ['/akari_solver/exact_verifier.py','/web/reference/game.png','/web/node_modules/playwright/package.json'])expect((await request.get(url)).status()).toBe(404);
});
test('catalog switches same puzzle solutions and actions never fabricate proof controls',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await page.locator('#replay-select').selectOption('small-manual');await expect(page.locator('#puzzle-meta')).toContainText('2 × 2');
 await page.locator('#timeline button[data-index="1"]').click();await expect(page.locator('#action-content')).toBeVisible();
 await expect(page.locator('[data-phase="branch"]')).toBeDisabled();await expect(page.locator('[data-phase="conclusion"]')).toBeDisabled();await expect(page.locator('#step-content')).toBeHidden();await expect(page.locator('#cost-value')).toHaveText('—');
 await page.locator('#next').click();await expect(page.locator('#progress-label')).toContainText('4 lit');
 await page.locator('#replay-select').selectOption('small-alternative');await expect(page.locator('#step-counter')).toContainText('0 / 3');
 await page.locator('#next').click();await expect(page.locator('#board [data-cell="(1,1)"]')).toHaveAttribute('aria-label','(1,1) Lamp');
 await page.locator('#next').click();await expect(page.locator('#board [data-cell="(1,1)"]')).toHaveAttribute('aria-label','(1,1) Blank');await expect(page.locator('#action-list')).toContainText('Remove');
 await page.locator('#next').click();await expect(page.locator('#progress-label')).toContainText('4 lit');
 await page.screenshot({path:path.join(root,'output/screenshots/generic-action-replay.png'),fullPage:true});
 await page.locator('#replay-select').selectOption('daily-648-proof');await expect(page.locator('#puzzle-meta')).toContainText('No. 648');await page.locator('#next').click();await expect(page.locator('[data-phase="branch"]')).toBeEnabled();
 expect(errors).toEqual([]);
});
test('URL selected replay, config default and config failure recovery',async({page})=>{
 await page.goto('/web/?replay=small-final');await expect(page.locator('#puzzle-meta')).toContainText('Final coordinates only');await page.locator('#next').click();await expect(page.locator('#action-note')).toContainText('no reasoning supplied');
 await page.route('**/replays.json',route=>route.fulfill({json:{version:1,defaultReplay:'only',replays:[{id:'only',title:'Configured alternative',solution:'./examples/manual.json'}]}}));
 await page.goto('/web/');await expect(page.locator('#replay-select')).toHaveValue('only');await expect(page.locator('#puzzle-meta')).toContainText('2 × 2');
 await page.unroute('**/replays.json');await page.route('**/replays.json',route=>route.fulfill({status:404,body:'missing'}));await page.goto('/web/');await expect(page.locator('#import-dialog')).toBeVisible();
 await page.locator('#report-file').setInputFiles(path.join(root,'web/examples/manual.json'));await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#import-dialog')).toBeHidden();await expect(page.locator('#puzzle-meta')).toContainText('2 × 2');
});
test('action export roundtrip and empty replay initial state',async({page})=>{
 await open(page);const promise=page.waitForEvent('download');await page.locator('#export-actions').click();const download=await promise;
 const file=await download.path(),exported=JSON.parse(fs.readFileSync(file));expect(exported.format).toBe('akari-replay');expect(exported.steps.length).toBe(26);expect(exported.steps[0].proof).toBeUndefined();
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles(file);await page.getByRole('button',{name:'Open replay'}).click();await page.locator('#timeline button[data-index="1"]').click();await expect(page.locator('#action-content')).toBeVisible();
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'akari-replay',version:2,puzzle:{grid:[[-1]]},initial_marks:{'(1,1)':'Lamp'},steps:[]}))});
 await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#step-counter')).toContainText('0 / 0');await expect(page.locator('#play')).toBeDisabled();await expect(page.locator('#next')).toBeDisabled();await expect(page.locator('#board [data-cell="(1,1)"]')).toHaveAttribute('aria-label','(1,1) Lamp');
});
test('partial action report exposes false completion claim and optional proof restores interaction',async({page})=>{
 await open(page);await page.locator('#import-open').click();
 const bad={format:'akari-replay',version:2,puzzle:{grid:[[-1,-1]]},steps:[{marks:{'(1,1)':'Lamp','(1,2)':'Lamp'}}],complete:true};
 await page.locator('#report-file').setInputFiles({name:'bad-final.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#validation-status')).toContainText('Invalid');await expect(page.locator('#step-counter')).toContainText('1 / 1');await expect(page.locator('#failure-content')).toBeVisible();
 const source=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy-v6-daily.json'))),e=source.history[0];
 const mixed={format:'akari-replay',version:2,puzzle:source.puzzle,steps:[{marks:e.new_marks,note:'Attached existing proof',proof:{format:'strict-local-v6',event:e}}]};
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles({name:'mixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mixed))});await page.getByRole('button',{name:'Open replay'}).click();await page.locator('#timeline button[data-index="1"]').click();await expect(page.locator('#step-note')).toHaveText('Attached existing proof');await expect(page.locator('[data-phase="branch"]')).toBeEnabled();
});
test('invalid suffix is excluded but last valid frame plays, with clear live verification',async({page})=>{
 await open(page);await page.locator('#import-open').click();
 const r={format:'akari-replay',version:2,puzzle:{grid:[[-1,-1],[-1,-1]]},steps:[{marks:{'(1,1)':'Lamp'}},{marks:{'(1,2)':'Lamp'}},{marks:{'(1,2)':null}}]};
 await page.locator('#report-file').setInputFiles({name:'wrong-suffix.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(r))});await page.getByRole('button',{name:'Open replay'}).click();
 await expect(page.locator('#import-dialog')).toBeHidden();await expect(page.locator('#validation-message')).toContainText('Step 2');
 await expect(page.locator('#step-counter')).toHaveText('0 / 2');await page.locator('#last-valid').click();
 await expect(page.locator('#board [data-cell="(1,1)"]')).toHaveAttribute('aria-label','(1,1) Lamp');await expect(page.locator('#board [data-cell="(1,2)"]')).toHaveAttribute('aria-label','(1,2) Lit');
 await expect(page.locator('#next')).toBeEnabled();await page.locator('#next').click();
 await expect(page.locator('#failure-reason')).toContainText('see each other');await expect(page.locator('#board [data-cell="(1,2)"]')).toHaveAttribute('aria-label','(1,2) Lamp');await expect(page.locator('#next')).toBeDisabled();
 await page.locator('#prev').click();await expect(page.locator('#validation-status')).toContainText('Invalid');
});
test('missing optional fields in strict proof are rebuilt without losing playback',async({page})=>{
 await open(page);const r=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/legacy-v6-daily.json')));
 delete r.statistics;delete r.grouping;delete r.inference_model;
 for(const e of r.history){for(const k of ['step','before','after','conclusions','cost','facts_before','facts_after','board_after','verification'])delete e[k];for(const p of e.components||[e])for(const k of ['before','facts_before','cost','candidate_counts','branch_proof','conclusions'])delete p[k];}
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles({name:'minimal-proof.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(r))});await page.getByRole('button',{name:'Open replay'}).click();
 await expect(page.locator('#initial-content')).toBeVisible();await expect(page.locator('#puzzle-meta')).not.toContainText('Loading');await expect(page.locator('#validation-banner')).toHaveCount(0);await expect(page.locator('#step-counter')).toHaveText('00 / 26');
 await page.locator('#timeline button[data-index="1"]').click();await page.locator('[data-phase="branch"]').click();await expect(page.locator('#branch-verdict')).toContainText('Compatible');
});
test('error frame is terminal, banner remains while navigating and export excludes rejected marks',async({page})=>{
 await open(page);await page.locator('#import-open').click();const r={format:'akari-replay',version:2,puzzle:{grid:[[-1,-1],[-1,-1]]},steps:[{marks:{'(1,1)':'Lamp'}},{marks:{'(1,2)':'Lamp'}},{marks:{'(1,2)':null}}]};
 await page.locator('#report-file').setInputFiles({name:'error.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(r))});await page.getByRole('button',{name:'Open replay'}).click();
 await page.locator('#show-failure').click();await expect(page.locator('#failure-content')).toBeVisible();await expect(page.locator('#failure-reason')).toContainText('see each other');await expect(page.locator('#state-pill')).toContainText('ERROR');
 await expect(page.locator('#timeline .error-frame')).toHaveCount(1);await expect(page.locator('#next')).toBeDisabled();
 await page.locator('#failure-back').click();await expect(page.locator('#step-counter')).toHaveText('1 / 2');await expect(page.locator('#validation-banner')).toBeVisible();expect(await page.locator('#validation-banner').evaluate(e=>getComputedStyle(e).position)).toBe('sticky');
 const downloadPromise=page.waitForEvent('download');await page.locator('#export-actions').click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path()));expect(exported.steps.length).toBe(1);expect(exported.steps[0].marks['(1,2)']).toBeUndefined();
 await page.locator('#show-failure').click();await page.screenshot({path:path.join(root,'output/screenshots/error-frame.png'),fullPage:true});
});
test('malformed initial frame immediately opens error details without crashing board',async({page})=>{
 await open(page);await page.locator('#import-open').click();const r={format:'akari-replay',version:2,puzzle:{grid:[[-1]]},steps:[{marks:{'(99,1)':'Lamp'}}]};
 await page.locator('#report-file').setInputFiles({name:'bad-first.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(r))});await page.getByRole('button',{name:'Open replay'}).click();
 await expect(page.locator('#step-counter')).toHaveText('1 / 1');await expect(page.locator('#failure-content')).toBeVisible();await expect(page.locator('#failure-preview-note')).toContainText('partial preview');await expect(page.locator('#failure-input')).toContainText('(99,1)');await expect(page.locator('#next')).toBeDisabled();
 await page.locator('#first').click();await expect(page.locator('#validation-status')).toContainText('Invalid');
});
test('remaining clue, original corner badge, exact satisfied face and negative error state',async({page})=>{
 await open(page);await page.locator('#import-open').click();
 const input={format:'akari-replay',version:2,puzzle:{grid:[[-1,-1,-1],[-1,2,-1],[-1,-1,-1]]},steps:[{marks:{'(1,2)':'Lamp'}},{marks:{'(2,1)':'Lamp'}},{marks:{'(3,2)':'Lamp'}}]};
 await page.locator('#report-file').setInputFiles({name:'remaining.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});await page.getByRole('button',{name:'Open replay'}).click();
 const clue=page.locator('#board [data-cell="(2,2)"]');
 await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-remaining')).toHaveText('2');await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-original')).toHaveCount(0);
 await page.locator('#next').click();await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-remaining')).toHaveText('1');await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-original')).toHaveText('2');
 await page.locator('#next').click();await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-satisfied')).toHaveCount(1);await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-original')).toHaveText('2');
 const image=page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-satisfied');await expect(image).toHaveAttribute('href',/clue-satisfied\.webp$/);expect((await page.request.get('/web/assets/clue-satisfied.webp')).ok()).toBeTruthy();
 await page.locator('#next').click();await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-remaining')).toHaveText('-1');await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-satisfied')).toHaveCount(0);await expect(page.locator('#board [data-render-cell="(2,2)"]').locator('.clue-original')).toHaveText('2');
 await expect(page.locator('#board [data-layer="numbers"] .clue-remaining')).toContainText(['-1']);
 await expect(page.locator('#board [data-layer="conflicts"] [data-render-cell="(2,2)"] .conflict-label')).toHaveText('!');
 await expect(page.locator('#board [data-layer="conflicts"] .clue-remaining')).toHaveCount(0);
 await page.screenshot({path:path.join(root,'output/screenshots/remaining-clue-error.png'),fullPage:true});
 await expect(page.locator('#original-board')).toHaveAttribute('href',/akari\/3\/3\/gggg2gggg$/);
});
test('hypothetical clue remaining resets across branch, before and after phases',async({page})=>{
 await open(page);await page.locator('#timeline button[data-index="6"]').click();
 const clue=page.locator('#board [data-cell="(2,5)"]');
 await page.locator('[data-phase="after"]').click();await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-satisfied')).toHaveCount(1);await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-original')).toHaveText('1');
 await page.locator('[data-phase="before"]').click();await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-remaining')).toHaveText('1');await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-original')).toHaveCount(0);
 await page.locator('[data-phase="branch"]').click();await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-satisfied')).toHaveCount(1);
 await page.locator('[data-phase="conclusion"]').click();await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-remaining')).toHaveText('1');
 await page.locator('[data-phase="after"]').click();await expect(page.locator('#board [data-render-cell="(2,5)"]').locator('.clue-satisfied')).toHaveCount(1);
 const downloadPromise=page.waitForEvent('download');await page.locator('#export-actions').click();const d=await downloadPromise;const output=JSON.parse(fs.readFileSync(await d.path()));expect(output.version).toBe(2);expect(output.steps[0].marks['(2,9)']).toBe('Lamp');expect(output.steps[0].marks['(1,2)']).toBe('Mark');
});

test('daily 649 defaults and playback use Common facts with consistent center and action names',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#initial-content')).toBeVisible();await expect(page.locator('#puzzle-meta')).not.toContainText('Loading');await expect(page.locator('#validation-banner')).toHaveCount(0);
 await expect(page.locator('#step-counter')).toHaveText('00 / 31');
 await page.locator('#start').click();
 await expect(page.locator('#step-counter')).toHaveText('01 / 31');
 await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#board-tools input, #show-centers, #show-rays, #show-new')).toHaveCount(0);
 await expect(page.locator('.legend')).not.toContainText('Explicit');
 await expect(page.locator('.legend')).toContainText('Proven');
 await page.locator('#timeline button[data-index="18"]').click();
 await expect(page.locator('#board-title')).toHaveText('Brain step');
 await expect(page.locator('#component-section')).toBeHidden();
 await expect(page.locator('#branch-section')).toBeHidden();
 await expect(page.locator('#result-section')).toBeVisible();
 await page.locator('[data-phase="branch"]').click();
 await expect(page.locator('#branch-section')).toBeVisible();
 await expect(page.locator('#result-section')).toBeHidden();
 await page.locator('[data-phase="conclusion"]').click();
 await expect(page.locator('#branch-section')).toBeHidden();
 await expect(page.locator('#result-section')).toBeVisible();
 await expect(page.locator('#mark-list')).toContainText('Mark (3,7)');
 await expect(page.locator('#candidate-controls')).toContainText('Mark (3,7)');
 await expect(page.locator('#candidate-controls')).toContainText('Mark (4,6)');
 await page.locator('#next').click();
 await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#board [data-cell="(2,7)"]')).toHaveAttribute('aria-label','(2,7) Blank');
 await expect(page.locator('#board [data-layer="proven"] [data-render-cell="(2,7)"]')).toContainText('Lamp');
 await expect(page.locator('#center-list .center-id')).toHaveText(['0','0']);
 await expect(page.locator('#board text.overlay').filter({hasText:'0'})).toHaveCount(2);
 await expect(page.locator('#center-list')).toContainText('Blank (2,7)');
 await expect(page.locator('#center-list')).toContainText('Mark (3,7)');
 await expect(page.locator('#candidate-controls')).toContainText('Lamp (2,7)');
 await expect(page.locator('#mark-list')).toHaveText('Lamp (2,7)');
 await page.locator('[data-phase="after"]').click();
 const mark=page.locator('#board [data-cell="(3,7)"]');
 await expect(mark).toHaveAttribute('aria-label','(3,7) Lit');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(0);
 await page.locator('[data-phase="before"]').click();
 await expect(mark).toHaveAttribute('aria-label','(3,7) Mark');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await expect(page.locator('#all-components')).toHaveText('Show each');
 await expect(page.locator('#branch-section')).toBeHidden();
 await expect(page.locator('#result-section')).toBeVisible();
 await page.locator('#component-list button').nth(1).click();
 await expect(page.locator('#all-components')).toHaveText('Click Show each');
 await expect(page.locator('#marks-heading')).toHaveText('Marks to commit');
 await expect(page.locator('#mark-list')).toHaveText('Lamp (2,7)');
 await page.locator('#all-components').click();
 await expect(page.locator('#all-components')).toHaveText('Show batch');
 await expect(page.locator('#branch-section')).toBeVisible();
 await expect(page.locator('#result-section')).toBeHidden();
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await expect(mark).toHaveAttribute('aria-label','(3,7) Hypothetically Lit');
 await page.locator('#all-components').click();
 await expect(page.locator('#all-components')).toHaveText('Show each');
 await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#result-section')).toBeVisible();
 await page.locator('#timeline button[data-index="18"]').click();
 await page.locator('#speed').selectOption({label:'Fast'});
 await page.locator('#play').click();
 await expect(page.locator('#step-counter')).toHaveText('19 / 31');
 await page.locator('#play').click();
 await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 const download=page.waitForEvent('download');await page.locator('#export-actions').click();
 const exported=JSON.parse(fs.readFileSync(await (await download).path()));
 expect(exported.steps[17].marks['(3,7)']).toBe('Mark');
 expect(exported.steps[18].marks['(2,7)']).toBe('Lamp');
 expect(errors).toEqual([]);
});

test('completed replay has a closing page after the final proof, with navigation and clean export',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#initial-content')).toBeVisible();await expect(page.locator('#puzzle-meta')).not.toContainText('Loading');await expect(page.locator('#validation-banner')).toHaveCount(0);
 await expect(page.locator('#timeline .finish-frame')).toHaveCount(1);
 await page.locator('#timeline button[data-index="31"]').click();
 const stepBoardTop=await page.locator('#board').evaluate(n=>n.getBoundingClientRect().top);
 await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#next')).toBeEnabled();
 await page.locator('#next').click();
 await expect(page.locator('#finish-content')).toBeVisible();
 await expect(page.locator('#board-title')).toHaveText('Puzzle complete');
 await expect(page.locator('#step-counter')).toHaveText('Done');
 await expect(page.locator('#finish-summary')).toHaveText('31 steps · 17 lamps · 78 / 78 white cells lit');
 await expect(page.locator('#progress-label')).toHaveText('17 lamps · 32 marks · 78 lit');
 expect(await page.locator('#board').evaluate(n=>n.getBoundingClientRect().top)).toBe(stepBoardTop);
 await expect(page.locator('.phase-tabs')).toBeVisible();
 for(const tab of await page.locator('.phase-tabs button').all())await expect(tab).toBeDisabled();
 await expect(page.locator('#step-content')).toBeHidden();
 await expect(page.locator('#next')).toBeDisabled();
 await expect(page.locator('#board .cell-hit path')).toHaveCount(0);
 const download=page.waitForEvent('download');await page.locator('#export-actions').click();
 const output=JSON.parse(fs.readFileSync(await (await download).path()));expect(output.steps).toHaveLength(31);
 await page.locator('#prev').click();await expect(page.locator('#step-counter')).toHaveText('31 / 31');
 await expect(page.locator('.phase-tabs')).toBeVisible();
 await page.locator('#speed').selectOption({label:'Fast'});await page.locator('#play').click();
 await expect(page.locator('#finish-content')).toBeVisible();
 await expect(page.locator('#play')).toHaveAttribute('aria-label','Play steps');
 await page.locator('#restart').click();await expect(page.locator('#initial-content')).toBeVisible();
 await page.locator('#start').click();await expect(page.locator('[data-phase="conclusion"]')).toHaveAttribute('aria-pressed','true');
 await page.setViewportSize({width:390,height:844});await page.locator('#timeline .finish-frame').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:path.join(root,'output/screenshots/finish-mobile.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('flat cells retain lamp overlap colors and selection',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#initial-content')).toBeVisible();await expect(page.locator('#puzzle-meta')).not.toContainText('Loading');await expect(page.locator('#validation-banner')).toHaveCount(0);
 await page.locator('#timeline .finish-frame').click();
 const singles=page.locator('#board [data-light-count="1"] .cell-bg');
 expect(await singles.count()).toBeGreaterThan(0);
 const singleColors=new Set(await singles.evaluateAll(ns=>ns.map(n=>n.getAttribute('fill'))));
 expect(singleColors.size).toBeGreaterThan(2);
 expect(singleColors.has('#22a8e2')||singleColors.has('#24b3f1')).toBeTruthy();
 const doubles=page.locator('#board [data-light-count="2"] .cell-bg');
 expect(await doubles.count()).toBeGreaterThan(0);
 const doubleColors=new Set(await doubles.evaluateAll(ns=>ns.map(n=>n.getAttribute('fill'))));
 expect(doubleColors.size).toBeGreaterThan(1);
 const maxChannel=hex=>Math.max(...hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)));
 expect(Math.max(...doubleColors.values().map(maxChannel))).toBeGreaterThan(Math.max(...singleColors.values().map(maxChannel)));
 expect(new Set(await page.locator('#board .cell-bg').evaluateAll(ns=>ns.map(n=>n.getAttribute('shape-rendering'))))).toEqual(new Set(['crispEdges']));
 await expect(page.locator('#board [data-layer="wall-sides"], #board [data-layer="wall-tops"], #board polygon')).toHaveCount(0);
 await expect(page.locator('#board [data-cell="(2,1)"]')).toHaveAttribute('transform','translate(23,63)');
 await page.locator('#board [data-cell="(2,1)"]').click();await expect(page.locator('#cell-inspector')).toContainText('Number');
 await page.locator('#first').click();
 expect(await page.locator('#board [data-light-count="1"]').count()).toBe(0);
 await expect(page.locator('#original-board')).toHaveAttribute('href',/^https:\/\/puzz\.link\//);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
});

test('Explore Lit and Lamp share rounded frames and differ by the Lamp symbol',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#puzzle-meta')).toContainText('No. 649');
 await page.locator('#timeline button[data-index="19"]').click();
 const lamp=page.locator('#board [data-cell="(2,7)"]');
 const existingLit=page.locator('#board [data-cell="(1,7)"]');
 const newLit=page.locator('#board [data-cell="(3,7)"]');
 const backgrounds=()=>page.locator('#board .cell-bg').evaluateAll(ns=>ns.map(n=>n.getAttribute('fill')));
 const beforeFills=await backgrounds();
 await expect(page.locator('#branch-section')).toBeHidden();
 await page.locator('#all-components').click();
 await expect(page.locator('[data-phase="branch"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#all-components')).toHaveText('Show batch');
 expect(await backgrounds()).toEqual(beforeFills);
 await expect(lamp).toHaveAttribute('data-light-count','0');
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('rect.hypothesis-selection')).toHaveAttribute('stroke-dasharray','5 2');
 await expect(page.locator('#board .hypothesis-selection')).toHaveAttribute('stroke','#48c78e');
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('.lamp-symbol')).toHaveAttribute('fill','none');
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('.lamp-symbol')).toHaveAttribute('stroke','#48c78e');
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('.lamp-symbol')).not.toHaveAttribute('stroke-dasharray',/.+/);
 await expect(page.locator('#board [data-render-cell="(1,5)"] .lamp-symbol')).toHaveAttribute('fill','#fff');
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('.lamp-symbol')).toHaveAttribute('r','6.2');
 await expect(existingLit).toHaveAttribute('aria-label','(1,7) Lit');
 await expect(page.locator('#board [data-render-cell="(1,7)"]').locator('.hypothesis-lit')).toHaveCount(0);
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('rect.hypothesis-lit')).toHaveAttribute('stroke','#23adea');
 for(const attr of ['x','y','width','height','fill','stroke-width','stroke-dasharray','rx']){
  expect(await page.locator('#board [data-render-cell="(3,7)"]').locator('.hypothesis-lit').getAttribute(attr)).toBe(await page.locator('#board [data-render-cell="(2,7)"]').locator('.hypothesis-selection').getAttribute(attr));
 }
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('.lamp-symbol, circle')).toHaveCount(0);
 await expect(page.locator('#board text.overlay').filter({hasText:/^(Lit|Lamp|Mark)$/})).toHaveCount(0);
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await expect(newLit).toHaveAttribute('aria-label','(3,7) Hypothetically Lit');
 await newLit.click();
 await expect(page.locator('#cell-inspector')).toContainText('Hypothetically Lit');
 await expect(page.locator('#cell-inspector')).not.toContainText('effect: Mark');
 await expect(page.locator('#board line, #board [data-layer="rays"]')).toHaveCount(0);
 expect(await page.locator('#board > [data-layer]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-layer')))).toEqual(['cells','outline','numbers','marked','proven','explored','selection','centers','conflicts','interaction']);
 expect(await page.locator('#board [data-render-cell="(3,7)"]').locator('.hypothesis-lit').evaluate(n=>getComputedStyle(n).shapeRendering)).not.toBe('crispedges');
 await lamp.click();
 await expect(page.locator('#board line')).toHaveCount(0);
 await page.locator('#all-components').click();
 await page.locator('[data-phase="after"]').click();
 await expect(page.locator('#board .hypothesis-lit, #board .hypothesis-selection')).toHaveCount(0);
 await expect(page.locator('#board [data-render-cell="(2,7)"]').locator('.lamp-symbol')).toHaveAttribute('fill','#fff');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(0);
 await page.locator('#timeline button[data-index="18"]').click();
 await page.locator('[data-phase="branch"]').click();
 const mark=page.locator('#board [data-cell="(3,7)"]');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveAttribute('stroke','#48c78e');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('.hypothesis-selection')).toHaveCount(0);
 await expect(page.locator('#board [data-render-cell="(4,6)"] path')).toHaveAttribute('stroke','#48c78e');
 await expect(page.locator('#board .hypothesis-selection')).toHaveCount(0);
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('circle')).toHaveCount(0);
 await expect(page.locator('#board .hypothesis-lit')).toHaveCount(0);
});

test('All phases use physical states while action history and center premises remain intact',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#puzzle-meta')).toContainText('No. 649');
 await page.locator('#timeline button[data-index="6"]').click();
 await expect(page.locator('#mark-list')).toHaveText('Lamp (3,4)');
 for(const cell of ['(1,4)','(2,4)','(4,4)','(5,4)']){
  const square=page.locator(`#board [data-cell="${cell}"]`);
  await expect(page.locator(`#board [data-render-cell="${cell}"]`).locator('text.overlay')).toHaveCount(0);
  await expect(page.locator(`#board [data-render-cell="${cell}"]`).locator('rect[stroke="#48c78e"]')).toHaveCount(0);
 }
 await page.locator('#timeline button[data-index="19"]').click();
 const previous=page.locator('#board [data-cell="(3,7)"]');
 await expect(page.locator('#center-list .center-card').nth(1)).toContainText('Mark (3,7)');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await expect(previous).toHaveAttribute('aria-label','(3,7) Lit');
 await previous.click();await expect(page.locator('#cell-inspector')).toContainText('(3,7) · Lit');
 await expect(page.locator('#board [data-render-cell="(4,6)"] path')).toHaveCount(1);
 await page.locator('[data-phase="before"]').click();await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await page.locator('[data-phase="conclusion"]').click();await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(1);
 await page.locator('[data-phase="after"]').click();await expect(previous).toHaveAttribute('aria-label','(3,7) Lit');
 await expect(page.locator('#board [data-render-cell="(3,7)"]').locator('path')).toHaveCount(0);
 const downloading=page.waitForEvent('download');await page.locator('#export-actions').click();
 const exported=JSON.parse(fs.readFileSync(await(await downloading).path()));
 expect(exported.steps[17].marks['(3,7)']).toBe('Mark');
 expect(exported.steps[18].marks).toEqual({'(2,7)':'Lamp'});
});

test('v8 import rejects redundant actions and exports only one geometry and action list',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');await expect(page.locator('#puzzle-meta')).toContainText('No. 649');
 await expect(page.locator('#format-label')).toHaveText('PROOF V8');
 const report=JSON.parse(fs.readFileSync(path.join(root,'results/daily-2026-10-16.json')));
 expect(Object.keys(report)).toEqual(['schema_version','puzzle','steps']);
 const wrong=structuredClone(report);wrong.steps[5].actions['(1,4)']='Mark';
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles({name:'v7-bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(wrong))});
 await page.getByRole('button',{name:'Open replay'}).click();
 await expect(page.locator('#validation-message')).toContainText('Step 6');
 await page.locator('#show-failure').click();await expect(page.locator('#failure-input')).toContainText('"actions"');await expect(page.locator('#failure-reason')).toContainText('after removing lit Marks');
 await page.locator('#import-open').click();await page.locator('#report-file').setInputFiles(path.join(root,'results/daily-2026-10-16.json'));
 await page.getByRole('button',{name:'Open replay'}).click();await expect(page.locator('#validation-banner')).toHaveCount(0);
 await page.locator('#timeline button[data-index="6"]').click();await expect(page.locator('#mark-list')).toHaveText('Lamp (3,4)');
 await expect(page.locator('#board [data-render-cell="(1,4)"] text.overlay')).toHaveCount(0);
 const downloading=page.waitForEvent('download');await page.locator('#export-actions').click();
 const output=JSON.parse(fs.readFileSync(await(await downloading).path()));
 expect(output.puzzle.grid).toBeDefined();expect(output.puzzle.puzzlink).toBeUndefined();expect(output.initial_marks).toBeUndefined();expect(output.steps).toHaveLength(31);
 expect(output.steps[5]).toEqual({marks:{'(3,4)':'Lamp'}});
});

test('versioned startup bypasses stale modules and reports module failures with retry',async({page})=>{
 const requests=[];
 await page.route('**/model.mjs*',route=>{
  const url=new URL(route.request().url());requests.push(url);
  return url.searchParams.has('v')?route.continue():route.fulfill({contentType:'application/javascript',body:'export const stale=true;'});
 });
 await page.goto('/web/');
 await expect(page.locator('#puzzle-meta')).toContainText('No. 649');
 expect(requests.length).toBeGreaterThan(0);
 expect(requests.every(url=>url.searchParams.has('v'))).toBeTruthy();
 await page.route('**/app.mjs*',route=>route.fulfill({contentType:'application/javascript',body:'throw new Error("Module startup regression");'}));
 await page.reload();
 await expect(page.locator('#replay-select')).toHaveText('Loading failed');
 await expect(page.locator('#catalog-status')).toContainText('Module startup regression');
 await page.unroute('**/app.mjs*');
 await page.locator('#catalog-reload').click();
 await expect(page.locator('#puzzle-meta')).toContainText('No. 649');
});

test('catalog requests time out with a visible error instead of loading forever',async({page})=>{
 await page.clock.install();
 await page.route('**/replays.json',()=>{});
 const requested=page.waitForRequest('**/replays.json');
 await page.goto('/web/',{waitUntil:'domcontentloaded'});
 await requested;
 await page.clock.fastForward(13000);
 await expect(page.locator('#catalog-status')).toContainText('timed out');
 await expect(page.locator('#replay-select')).toHaveText('Loading failed');
});


test('pooled candidates count independently of Brain cost and sort compatible first across pages',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#format-label')).toHaveText('PROOF V8');
 await page.locator('#timeline button[data-index="3"]').click();
 await page.locator('[data-phase="branch"]').click();
 await expect(page.locator('#candidate-summary')).toHaveText('2 positions · 2 candidates · 2 compatible · Brain cost 2');
 await expect(page.locator('#branch-list button span')).toHaveText(['Lamp (9,1)','Lamp (10,2)']);
 await expect(page.locator('#candidate-controls')).not.toContainText('Mark');
 await page.locator('#timeline button[data-index="5"]').click();
 await page.locator('[data-phase="branch"]').click();
 await expect(page.locator('#candidate-summary')).toHaveText('4 positions · 2 candidates · 2 compatible · Brain cost 8');
 await expect(page.locator('#candidate-controls select')).toHaveCount(0);
 await expect(page.locator('#candidate-controls [data-pool-cell]')).toHaveCount(4);
 await page.locator('#timeline button[data-index="23"]').click();
 await page.locator('[data-phase="branch"]').click();
 await expect(page.locator('#candidate-summary')).toHaveText('9 positions · 24 candidates · 7 compatible · Brain cost 24');
 await expect(page.locator('#branch-list button')).toHaveCount(4);
 await expect(page.locator('#branch-list button[data-status="compatible"]')).toHaveCount(4);
 await expect(page.locator('#proof-page')).toHaveText('1 / 6 candidate pages');
 await page.locator('#proof-next').click();
 await expect(page.locator('#branch-list button[data-status="compatible"]')).toHaveCount(3);
 await expect(page.locator('#branch-list button').nth(3)).toHaveAttribute('data-status','conflict');
 await page.locator('#branch-list button').nth(3).click();
 await expect(page.locator('#branch-verdict')).toContainText('Direct conflict');
 await page.locator('#proof-next').click();
 await expect(page.locator('#proof-page')).toHaveText('3 / 6 candidate pages');
 await page.locator('#branch-list button').first().click();
 await expect(page.locator('#branch-position')).toHaveText('9 / 24');
 await page.locator('#branch-prev').click();
 await expect(page.locator('#branch-position')).toHaveText('8 / 24');
 await expect(page.locator('#proof-page')).toHaveText('2 / 6 candidate pages');
});


test('committed and explored symbols occupy separate layers below shared center/conflict badges',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await page.locator('#timeline button[data-index="19"]').click();await page.locator('#all-components').click();
 await expect(page.locator('#board [data-layer="marked"] [data-render-cell="(3,7)"] .mark-symbol')).toHaveAttribute('stroke','#bfc8d0');
 await expect(page.locator('#board [data-layer="explored"] [data-render-cell="(3,7)"] .hypothesis-lit')).toHaveAttribute('fill','none');
 await expect(page.locator('#board [data-layer="explored"] [data-render-cell="(2,7)"] .lamp-symbol')).toHaveAttribute('fill','none');
 await page.locator('#timeline button[data-index="23"]').click();await page.locator('[data-phase="branch"]').click();
 await page.locator('#proof-next').click();
 await page.locator('#branch-list button[data-status="conflict"]').first().click();
 const center=page.locator('#board .center-frame').first(),conflict=page.locator('#board .conflict-frame').first();
 for(const attr of ['x','y','width','height','rx','stroke-width','fill'])expect(await conflict.getAttribute(attr)).toBe(await center.getAttribute(attr));
 const centerLabel=page.locator('#board .center-label').first(),conflictLabel=page.locator('#board .conflict-label').first();
 await expect(conflictLabel).toHaveText('!');
 for(const attr of ['x','y','font-size','text-anchor'])expect(await conflictLabel.getAttribute(attr)).toBe(await centerLabel.getAttribute(attr));
 await expect(page.locator('#board [data-layer="interaction"] text, #board [data-layer="interaction"] path, #board [data-layer="interaction"] circle')).toHaveCount(0);
 const cell=await conflict.evaluate(n=>n.parentElement.dataset.renderCell);
 await page.locator(`#board [data-cell="${cell}"]`).click();
 await expect(page.locator('#cell-inspector')).toContainText('CONFLICT');
 await expect(page.locator('#board [data-layer="selection"] .interaction-highlight')).toHaveCount(1);
 await expect(page.locator('#board [data-layer="conflicts"] .conflict-label').first()).toHaveText('!');
});


test('step counter pads to total step digits including single and triple digits',async({page})=>{
 await page.goto('/web/?replay=small-alternative');
 await expect(page.locator('#step-counter')).toHaveText('0 / 3');
 await page.locator('#next').click();await expect(page.locator('#step-counter')).toHaveText('1 / 3');
 const report={format:'akari-replay',version:2,puzzle:{grid:[[-1]]},steps:Array.from({length:120},(_,i)=>({note:`Frame ${i+1}`}))};
 await page.locator('#import-open').click();
 await page.locator('#report-file').setInputFiles({name:'120-steps.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.getByRole('button',{name:'Open replay'}).click();
 await expect(page.locator('#step-counter')).toHaveText('000 / 120');
 await page.locator('#next').click();await expect(page.locator('#step-counter')).toHaveText('001 / 120');
 await expect(page.locator('#board-kicker')).toHaveText('STEP 001 / 120');
 await page.locator('#timeline button[data-index="99"]').click();await expect(page.locator('#step-counter')).toHaveText('099 / 120');
 await page.locator('#next').click();await expect(page.locator('#step-counter')).toHaveText('100 / 120');
});

test('cost expression is supplied by the protocol, switches with components and hides when absent',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await page.locator('#timeline button[data-index="1"]').click();
 await expect(page.locator('#cost-formula')).toHaveText('1 + 1 = 2');
 await page.locator('#all-components').click();await expect(page.locator('#cost-formula')).toHaveText('1 = 1');
 const report=JSON.parse(fs.readFileSync(path.join(root,'results/daily-2026-10-16.json')));
 report.cost_model='overlap-experimental';
 for(const step of report.steps){delete step.cost_expression;delete step.proof_cost_expressions;}
 report.steps[0].cost_expression='Batch from protocol';report.steps[0].proof_cost_expressions=['First from protocol','Second from protocol'];
 report.steps[3].cost_expression='<b>Experimental formula from protocol</b>';
 await page.locator('#import-open').click();
 await page.locator('#report-file').setInputFiles({name:'expressions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});
 await page.getByRole('button',{name:'Open replay'}).click();
 await page.locator('#timeline button[data-index="1"]').click();await expect(page.locator('#cost-formula')).toHaveText('Batch from protocol');
 await page.locator('#all-components').click();await expect(page.locator('#cost-formula')).toHaveText('First from protocol');
 await page.locator('#component-list button').nth(1).click();await expect(page.locator('#cost-formula')).toHaveText('Second from protocol');
 await page.locator('#all-components').click();await expect(page.locator('#cost-formula')).toHaveText('Batch from protocol');
 await page.locator('#timeline button[data-index="2"]').click();await expect(page.locator('#cost-formula')).toBeHidden();
 await page.locator('#timeline button[data-index="4"]').click();
 await expect(page.locator('#cost-formula')).toHaveText('<b>Experimental formula from protocol</b>');
 await expect(page.locator('#cost-formula b')).toHaveCount(0);
 await page.locator('#timeline button[data-index="5"]').click();await expect(page.locator('#cost-formula')).toBeHidden();
});

test('649 standard and experimental reports switch independently through the catalog',async({page})=>{
 await page.goto('/web/?replay=daily-649-proof');
 await expect(page.locator('#step-counter')).toHaveText('00 / 31');
 await page.locator('#replay-select').selectOption('daily-649-overlap');
 await expect(page.locator('#step-counter')).toHaveText('00 / 29');
 await page.locator('#timeline button[data-index="4"]').click();
 await expect(page.locator('#cost-value')).toHaveText('5');
 await expect(page.locator('#cost-formula')).toContainText('+ 2 - 1 = 5');
 await page.locator('#timeline .finish-frame').click();await expect(page.locator('#step-counter')).toHaveText('Done');
 await page.locator('#replay-select').selectOption('daily-649-proof');
 await expect(page.locator('#step-counter')).toHaveText('00 / 31');
 await page.locator('#timeline button[data-index="4"]').click();await expect(page.locator('#cost-value')).toHaveText('6');
});


test('Common facts preserves the entire committed layer until After in both cost modes',async({page})=>{
 for(const [replay,step] of [['daily-649-overlap',17],['daily-649-proof',19]]){
  await page.goto(`/web/?replay=${replay}`);
  await page.locator(`#timeline button[data-index="${step}"]`).click();
  await page.locator('[data-phase="before"]').click();
  const marked=()=>page.locator('#board [data-layer="marked"]').innerHTML();
  const before=await marked();
  await page.locator('[data-phase="conclusion"]').click();
  expect(await marked()).toBe(before);
  if(replay==='daily-649-overlap'){
   for(const cell of ['(7,9)','(5,10)','(8,10)'])await expect(page.locator(`#board [data-layer="marked"] [data-render-cell="${cell}"] .mark-symbol`)).toHaveCount(1);
   await expect(page.locator('#board [data-layer="proven"] [data-render-cell="(7,10)"]')).toContainText('Lamp');
   await expect(page.locator('#board [data-layer="centers"] [data-render-cell="(7,9)"] .center-label')).toHaveCount(1);
  }
  await page.locator('[data-phase="after"]').click();
  expect(await marked()).not.toBe(before);
  const covered=replay==='daily-649-overlap'?['(7,9)','(5,10)','(8,10)']:['(3,7)'];
  for(const cell of covered)await expect(page.locator(`#board [data-layer="marked"] [data-render-cell="${cell}"] .mark-symbol`)).toHaveCount(0);
  await page.locator('[data-phase="conclusion"]').click();expect(await marked()).toBe(before);
 }
});
