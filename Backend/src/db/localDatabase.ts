const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const hostsOf = (uri: string): string[] | null => {
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(uri.trim());
  if (match === null || match[1] === undefined) return null;
  return match[1].split(',').map((entry) =>
    (entry.startsWith('[') ? entry.slice(1, entry.indexOf(']')) : entry.split(':')[0] ?? '').toLowerCase(),
  );
};

export const isLocalHost = (hostname: string): boolean =>
  LOCAL_HOSTS.has(hostname.replace(/^\[|\]$/g, '').toLowerCase());

/** Local means a plain mongodb:// URI whose every host is this machine; SRV and remote hosts never are. */
export const isLocalDatabaseUri = (uri: string): boolean => {
  const hosts = hostsOf(uri);
  return hosts !== null && hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host));
};

export const describeDatabaseTarget = (uri: string): string => {
  const srv = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(uri.trim());
  if (srv !== null) return `the SRV cluster ${srv[1] ?? ''}`;
  const hosts = hostsOf(uri);
  return hosts === null ? 'an unreadable connection string' : hosts.join(', ');
};
