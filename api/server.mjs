import { createRequestHandler } from '@angular/ssr/vercel';
import bootstrap from '../dist/mitiwebssr/server/main.server.mjs';

export default createRequestHandler({ build: bootstrap });
