import DataSourceBadge from './DataSourceBadge';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export default function CommunityPulse() {
  const stats = [
    { value: '12.4k', label: 'prompts routed' },
    { value: '89%', label: 'avg savings' },
  ];
  return (
    <section className="pulse">
      {stats.map((s) => (
        <Stat key={s.label} value={s.value} label={s.label} />
      ))}
      <DataSourceBadge live={false} />
    </section>
  );
}
