import type { ReactNode } from 'react';

export const fillIn = (template: string, values: Record<string, ReactNode>): ReactNode[] =>
  template.split(/(\{[a-z]+\})/).map((part, index) => {
    const key = part.startsWith('{') && part.endsWith('}') ? part.slice(1, -1) : null;
    return key !== null && key in values ? <bdi dir="ltr" key={index}>{values[key]}</bdi> : part;
  });
