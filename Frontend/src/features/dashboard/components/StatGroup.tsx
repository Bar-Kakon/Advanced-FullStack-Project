export interface Stat {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export const StatGroup = ({ stats }: { stats: readonly Stat[] }) => (
  <ul className="stat-group">
    {stats.map((stat) => (
      <li key={stat.key} className="stat">
        <span className="stat__value">{stat.value}</span>
        <span className="stat__label">{stat.label}</span>
      </li>
    ))}
  </ul>
);
