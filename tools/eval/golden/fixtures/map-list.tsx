export default function List({ items }: { items: string[] }) {
  return (
    <ul className="list">
      {items.map((i) => (
        <li key={i} className="item">
          <span className="dot" />
          <span className="text">{i}</span>
        </li>
      ))}
    </ul>
  );
}
