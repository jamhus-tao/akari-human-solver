import {validateReplay} from './validation.mjs?v=754b0258aff5fda6';
self.onmessage=({data})=>{try{self.postMessage({result:validateReplay(data.report,data.grid)});}catch(e){self.postMessage({error:e.message});}};
