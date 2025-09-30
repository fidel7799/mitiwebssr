const { reqHandler } = await import(
	new URL('../dist/mitiwebssr/server/server.mjs', import.meta.url).href,
);

export default reqHandler;
