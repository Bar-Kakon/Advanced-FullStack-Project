/**
 * A local SMTP stand-in for verification runs: it accepts every message on 127.0.0.1 and appends it
 * to a JSON-lines file, so a test can read the links an email carries without any real delivery.
 *
 *   node scripts/support/smtpSink.mjs <port> <output file>
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

const [, , portArg, outFile] = process.argv;
if (!portArg || !outFile) {
  console.error('usage: smtpSink.mjs <port> <output file>');
  process.exit(2);
}

writeFileSync(outFile, '');

const server = createServer((socket) => {
  socket.setEncoding('utf8');
  let buffer = '';
  let inData = false;
  let recipients = [];
  const reply = (line) => socket.write(`${line}\r\n`);

  reply('220 blokta-local-sink ESMTP');

  socket.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        const raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.');
        buffer = buffer.slice(end + 5);
        appendFileSync(outFile, `${JSON.stringify({ to: recipients, raw, at: new Date().toISOString() })}\n`);
        inData = false;
        recipients = [];
        reply('250 queued');
        continue;
      }
      const newline = buffer.indexOf('\r\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      const verb = line.split(' ')[0].toUpperCase();
      if (verb === 'EHLO') socket.write('250-blokta-local-sink\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
      else if (verb === 'AUTH') reply('235 accepted');
      else if (verb === 'RCPT') {
        recipients.push(/<([^>]*)>/.exec(line)?.[1]?.toLowerCase() ?? '');
        reply('250 ok');
      } else if (verb === 'DATA') {
        inData = true;
        reply('354 end with <CRLF>.<CRLF>');
      } else if (verb === 'QUIT') {
        reply('221 bye');
        socket.end();
        return;
      } else reply('250 ok');
    }
  });
  socket.on('error', () => undefined);
});

server.listen(Number(portArg), '127.0.0.1', () => {
  console.log(`SMTP sink listening on 127.0.0.1:${portArg}, writing ${outFile}`);
});
