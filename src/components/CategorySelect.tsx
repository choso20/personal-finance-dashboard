import type { Category } from '../types';
import { Badge } from './ui';

export function CategorySelect({
  value,
  onChange,
  categories,
  className = '',
  allowEmpty,
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  className?: string;
  allowEmpty?: string;
}) {
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function CategoryBadge({ category }: { category?: Category }) {
  if (!category) return <Badge color="#94a3b8">Unknown</Badge>;
  return <Badge color={category.color}>{category.name}</Badge>;
}
