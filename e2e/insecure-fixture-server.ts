import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export type InsecureFixtureServer = Readonly<{
  url: URL;
  close: () => Promise<void>;
}>;

export async function startInsecureFixtureServer(
  fixtureUrl: URL,
): Promise<InsecureFixtureServer> {
  const fixture = await readFile(fixtureUrl);
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      connection: 'close',
      'content-type': 'text/html; charset=utf-8',
    });
    response.end(fixture);
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      reject(error);
    };
    server.once('error', handleError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', handleError);
      resolve();
    });
  });

  const close = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
      server.closeAllConnections();
    });

  const address: null | string | AddressInfo = server.address();
  if (address === null || typeof address === 'string') {
    await close();
    throw new Error('expected an insecure fixture TCP address');
  }

  return {
    url: new URL(`http://squawk.test:${address.port.toString()}`),
    close,
  };
}
