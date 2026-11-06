import { createHandler } from './core.mjs';
Deno.serve(createHandler((key: string) => Deno.env.get(key)));
