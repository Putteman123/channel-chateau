import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Category {
  id: string;
  name: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
}: CategoryFilterProps) {
  return (
    <Select
      value={selectedCategory ?? 'all'}
      onValueChange={(value) => onSelectCategory(value === 'all' ? null : value)}
    >
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="Alla kategorier" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alla</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
