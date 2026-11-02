// The few parts of Deno that the functions use, so the app's TypeScript check can read them.
// Deno itself never loads this file; it has the real thing.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};
