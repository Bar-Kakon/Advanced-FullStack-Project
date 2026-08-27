type LogPayload = Record<string, unknown>;

const write = (stream: NodeJS.WriteStream, level: string, message: string, payload?: LogPayload): void => {
  const line = { level, time: new Date().toISOString(), message, ...payload };
  stream.write(`${JSON.stringify(line)}\n`);
};

export const logger = {
  info: (message: string, payload?: LogPayload): void => write(process.stdout, 'info', message, payload),
  warn: (message: string, payload?: LogPayload): void => write(process.stderr, 'warn', message, payload),
  error: (message: string, payload?: LogPayload): void => write(process.stderr, 'error', message, payload),
};
