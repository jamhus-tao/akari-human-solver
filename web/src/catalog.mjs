// Configured URLs are static same-origin resources, not executable adapters.
export function localURL(value, base) {
  if(typeof value!=='string'||!value.trim())throw new Error('Catalog file path must be a nonempty string.');
  const origin=new URL(base),url=new URL(value,origin);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin.origin||url.username||url.password)
    throw new Error('Catalog paths must be same-origin HTTP(S) resources.');
  url.hash='';return url.href;
}
export function normalizeCatalog(config,base){
  if(config?.version!==1||!Array.isArray(config.replays)||!config.replays.length||config.replays.length>500)
    throw new Error('Catalog version 1 requires 1 to 500 replay entries.');
  const ids=new Set();
  const replays=config.replays.map(e=>{
    if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(e.id)||ids.has(e.id))throw new Error('Catalog replay IDs must be unique safe identifiers.');
    if(typeof e.title!=='string'||!e.title||e.title.length>300)throw new Error('Catalog replay requires a title.');
    ids.add(e.id);
    return {id:e.id,title:e.title,puzzleTitle:typeof e.puzzleTitle==='string'?e.puzzleTitle.slice(0,300):'',
      solution:localURL(e.solution,base),puzzle:e.puzzle?localURL(e.puzzle,base):null,
      reference:e.reference?localURL(e.reference,base):null};
  });
  const defaultReplay=config.defaultReplay??replays[0].id;
  if(!ids.has(defaultReplay))throw new Error('Catalog defaultReplay must refer to a listed ID.');
  return {defaultReplay,replays};
}

// Generate a canonical external puzzle link from validated geometry. Imported
// metadata cannot replace it with an executable URL or an unrelated website.
export function originalBoardURL(grid) {
  const body=grid.flat().map(v=>v===-1?'g':v===-2?'.':String(v)).join('');
  return `https://puzz.link/p?akari/${grid[0].length}/${grid.length}/${body}`;
}
